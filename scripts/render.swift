// Render the game images for one receipt.
// Usage: swift scripts/render.swift spec.json
// spec: [{ "src": path, "out": dir, "maxW": 1100,
//          "segments": [[x,y,w,h], ...],   // revealable lines (fractions, top-left origin)
//          "hidden":   [[x,y,w,h], ...],   // never revealed in play (shop name, address, logo)
//          "private":  [[x,y,w,h], ...] }] // pixelated everywhere, even at the end (card digits, names)
// Writes: full.jpg (private pixelated), base.jpg (+ hidden and segments inked out), s0.jpg… (segment crops of the play image)

import Foundation
import CoreImage
import AppKit
import UniformTypeIdentifiers

let ctx = CIContext()
struct Spec: Decodable { let src: String; let out: String; let maxW: Double?; let crop: [Double]?; let segments: [[[Double]]]; let hidden: [[Double]]; let `private`: [[Double]] }

func loadImage(_ p: String) -> CGImage {
  guard let img = NSImage(contentsOfFile: p), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fatalError("can't read \(p)") }
  return cg
}
func writeJPEG(_ img: CGImage, _ path: String, q: Double = 0.82) {
  let url = URL(fileURLWithPath: path) as CFURL
  guard let dest = CGImageDestinationCreateWithURL(url, UTType.jpeg.identifier as CFString, 1, nil) else { fatalError("can't write \(path)") }
  CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: q] as CFDictionary)
  CGImageDestinationFinalize(dest)
}
// fraction box (top-left origin) -> CG rect in pixels (bottom-left origin)
func rect(_ b: [Double], _ w: Int, _ h: Int, pad: Double = 0) -> CGRect {
  let W = Double(w), H = Double(h)
  return CGRect(x: b[0] * W - pad, y: H - (b[1] + b[3]) * H - pad, width: b[2] * W + 2 * pad, height: b[3] * H + 2 * pad)
    .intersection(CGRect(x: 0, y: 0, width: W, height: H))
}

let specs = try JSONDecoder().decode([Spec].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
for s in specs {
  try? FileManager.default.createDirectory(atPath: s.out, withIntermediateDirectories: true)
  var src = loadImage(s.src)
  // crop to the receipt (fractions, top-left origin) before anything else
  if let c = s.crop {
    let r = CGRect(x: c[0] * Double(src.width), y: c[1] * Double(src.height), width: c[2] * Double(src.width), height: c[3] * Double(src.height)).integral
      .intersection(CGRect(x: 0, y: 0, width: src.width, height: src.height))
    src = src.cropping(to: r)!
  }
  // downscale for the web
  let maxW = s.maxW ?? 1100
  if Double(src.width) > maxW {
    let scale = maxW / Double(src.width)
    let ci = CIImage(cgImage: src).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    src = ctx.createCGImage(ci, from: ci.extent.integral)!
  }
  let w = src.width, h = src.height
  let full = CGRect(x: 0, y: 0, width: w, height: h)

  // 1. pixelate private boxes
  var ci = CIImage(cgImage: src)
  for b in s.private {
    let r = rect(b, w, h, pad: 4)
    let px = CIFilter(name: "CIPixellate", parameters: [kCIInputImageKey: ci.cropped(to: r).clampedToExtent(), kCIInputScaleKey: max(10, r.height / 2.5), kCIInputCenterKey: CIVector(x: r.minX, y: r.minY)])!.outputImage!.cropped(to: r)
    ci = px.composited(over: ci)
  }
  let fullImg = ctx.createCGImage(ci, from: full)!
  writeJPEG(fullImg, s.out + "/full.jpg")

  func ink(_ base: CGImage, _ boxes: [[Double]], color: CGColor) -> CGImage {
    let c = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    c.draw(base, in: full)
    c.setFillColor(color)
    for b in boxes { c.fill(rect(b, w, h, pad: 1)) }
    return c.makeImage()!
  }
  // 2. play image: hidden boxes inked permanently; segment tiles are cut from this
  let play = ink(fullImg, s.hidden, color: CGColor(red: 0.086, green: 0.094, blue: 0.114, alpha: 1))
  var tiles: [[[Double]]] = []
  for (i, parts) in s.segments.enumerated() {
    var t: [[Double]] = []
    for (j, b) in parts.enumerated() {
      let r = rect(b, w, h, pad: 1)
      let flipped = CGRect(x: r.minX, y: Double(h) - r.maxY, width: r.width, height: r.height).integral
        .intersection(CGRect(x: 0, y: 0, width: w, height: h))
      writeJPEG(play.cropping(to: flipped)!, s.out + "/s\(i)_\(j).jpg", q: 0.85)
      // where the tile actually sits (fractions, top-left origin) so the page can place it exactly
      t.append([flipped.minX / Double(w), flipped.minY / Double(h), flipped.width / Double(w), flipped.height / Double(h)])
    }
    tiles.append(t)
  }
  let manifest: [String: Any] = ["w": w, "h": h, "tiles": tiles]
  try! JSONSerialization.data(withJSONObject: manifest).write(to: URL(fileURLWithPath: s.out + "/tiles.json"))
  // 3. base: everything inked
  let base = ink(play, s.segments.flatMap { $0 }, color: CGColor(red: 0.086, green: 0.094, blue: 0.114, alpha: 1))
  writeJPEG(base, s.out + "/base.jpg")
  print("rendered \(s.out) \(w)x\(h) segments=\(s.segments.count)")
}
