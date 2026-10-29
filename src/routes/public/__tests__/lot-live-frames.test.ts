import { describe, expect, it } from "vitest";

import { readLiveFrames } from "./lot-live-frames";

const textFrames = [
  { name: "short unmasked", hex: "8103616263" },
  { name: "short masked", hex: "818311223344704050" },
  { name: "16-bit unmasked", hex: "817e0003616263" },
  { name: "16-bit masked", hex: "81fe000311223344704050" },
  { name: "64-bit unmasked", hex: "817f0000000000000003616263" },
  { name: "64-bit masked", hex: "81ff000000000000000311223344704050" },
];
const decodedText = { opcode: 0x1, payload: "abc" };

describe("live wire frame decoding", () => {
  it.each(textFrames)("decodes $name without changing the input", ({ hex }) => {
    const buffer = Buffer.from(hex, "hex");
    const original = Buffer.from(buffer);

    expect(readLiveFrames(buffer)).toEqual({
      frames: [decodedText],
      rest: Buffer.alloc(0),
    });
    expect(buffer).toEqual(original);
  });

  it.each(textFrames)("resumes $name at every byte boundary", ({ hex }) => {
    const frame = Buffer.from(hex, "hex");
    const prefix = Buffer.from("810178", "hex");

    for (let split = 0; split < frame.length; split += 1) {
      const incomplete = frame.subarray(0, split);
      const partial = readLiveFrames(Buffer.concat([prefix, incomplete]));

      expect(partial.frames).toEqual([{ opcode: 0x1, payload: "x" }]);
      expect(partial.rest).toEqual(incomplete);

      const resumed = readLiveFrames(
        Buffer.concat([partial.rest, frame.subarray(split)]),
      );

      expect(resumed).toEqual({ frames: [decodedText], rest: Buffer.alloc(0) });
    }
  });

  it.each([
    { name: "short maximum", header: "817d", length: 125 },
    { name: "16-bit minimum", header: "817e007e", length: 126 },
    { name: "16-bit maximum", header: "817effff", length: 65_535 },
    { name: "64-bit minimum", header: "817f0000000000010000", length: 65_536 },
  ])("reads the complete $name payload", ({ header, length }) => {
    const payload = "a".repeat(length);
    const buffer = Buffer.concat([Buffer.from(header, "hex"), Buffer.from(payload)]);

    expect(readLiveFrames(buffer.subarray(0, -1))).toEqual({
      frames: [],
      rest: buffer.subarray(0, -1),
    });
    expect(readLiveFrames(buffer)).toEqual({
      frames: [{ opcode: 0x1, payload }],
      rest: Buffer.alloc(0),
    });
  });

  it("decodes UTF-8 text after unmasking with a repeating mask", () => {
    const buffer = Buffer.from("818611223344d28bc3db89a2", "hex");

    expect(readLiveFrames(buffer)).toEqual({
      frames: [{ opcode: 0x1, payload: "é😀" }],
      rest: Buffer.alloc(0),
    });
  });

  it("consumes control payloads and empty frames between text frames", () => {
    const buffer = Buffer.from(
      "81036162638901788a811122334469880203e88100",
      "hex",
    );

    expect(readLiveFrames(buffer)).toEqual({
      frames: [
        decodedText,
        { opcode: 0x9, payload: "" },
        { opcode: 0xa, payload: "" },
        { opcode: 0x8, payload: "" },
        { opcode: 0x1, payload: "" },
      ],
      rest: Buffer.alloc(0),
    });
  });

  it("keeps an empty buffer empty", () => {
    expect(readLiveFrames(Buffer.alloc(0))).toEqual({
      frames: [],
      rest: Buffer.alloc(0),
    });
  });
});
