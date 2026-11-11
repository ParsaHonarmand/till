// Contact sheet of receipt images, numbered, for quick visual triage.
// Usage: swift scripts/sheet.swift out.jpg cols cellW img1 img2 ...
import Foundation
import AppKit

let a = CommandLine.arguments
let out = a[1], cols = Int(a[2])!, cellW = CGFloat(Int(a[3])!)
let files = Array(a.dropFirst(4))
let cellH = cellW * 1.5
let rowsN = (files.count + cols - 1) / cols
let W = Int(cellW) * cols, H = Int(cellH) * rowsN
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(gray: 0.15, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
for (i, f) in files.enumerated() {
  let col = i % cols, row = i / cols
  let x0 = CGFloat(col) * cellW, y0 = CGFloat(H) - CGFloat(row + 1) * cellH
  if let img = NSImage(contentsOfFile: f), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) {
    let s = min((cellW - 8) / CGFloat(cg.width), (cellH - 8) / CGFloat(cg.height))
    let w = CGFloat(cg.width) * s, h = CGFloat(cg.height) * s
    ctx.draw(cg, in: CGRect(x: x0 + (cellW - w) / 2, y: y0 + (cellH - h) / 2, width: w, height: h))
  }
  let label = "\(i)" as NSString
  ctx.setFillColor(CGColor(red: 1, green: 0.85, blue: 0.2, alpha: 1)); ctx.fill(CGRect(x: x0 + 4, y: y0 + cellH - 34, width: 40, height: 30))
  label.draw(at: CGPoint(x: x0 + 8, y: y0 + cellH - 32), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 22), .foregroundColor: NSColor.black])
}
let img = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, "public.jpeg" as CFString, 1, nil)!
CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: 0.7] as CFDictionary)
CGImageDestinationFinalize(dest)
print("sheet \(files.count) -> \(out)")
