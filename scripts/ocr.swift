// Read text lines (with positions) from receipt photos using Apple's Vision framework.
// Usage: swift scripts/ocr.swift out.json img1.jpg img2.jpg ...
// Output: { "<file>": { "w": px, "h": px, "lines": [{ "t": text, "c": confidence, "b": [x, y, w, h] }] } }
// Boxes are fractions of the image, origin top-left.

import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: ocr.swift out.json images..."); exit(1) }
let outPath = args[1]
var result: [String: Any] = [:]
if let data = FileManager.default.contents(atPath: outPath),
   let old = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { result = old }

for (i, file) in args.dropFirst(2).enumerated() {
  let key = (file as NSString).lastPathComponent
  if result[key] != nil { continue }
  guard let img = NSImage(contentsOfFile: file),
        let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("skip (unreadable) \(file)\n".data(using: .utf8)!); continue
  }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  if #available(macOS 13.0, *) { req.automaticallyDetectsLanguage = true }
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  do { try handler.perform([req]) } catch {
    FileHandle.standardError.write("fail \(file): \(error)\n".data(using: .utf8)!); continue
  }
  var lines: [[String: Any]] = []
  for obs in req.results ?? [] {
    guard let top = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    lines.append([
      "t": top.string,
      "c": Double(round(top.confidence * 100) / 100),
      "b": [b.minX, 1 - b.maxY, b.width, b.height].map { Double(round($0 * 10000) / 10000) },
    ])
  }
  result[key] = ["w": cg.width, "h": cg.height, "lines": lines]
  if i % 10 == 0 {
    FileHandle.standardError.write("\(i + 1)/\(args.count - 2)\n".data(using: .utf8)!)
    let d = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    try! d.write(to: URL(fileURLWithPath: outPath))
  }
}
let d = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
try! d.write(to: URL(fileURLWithPath: outPath))
print("ocr: \(result.count) images")
