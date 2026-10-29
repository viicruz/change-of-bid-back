export type LiveFrame = {
  opcode: number;
  payload: string;
};

type FrameHeader = {
  opcode: number;
  mask: Buffer;
  payloadOffset: number;
  endOffset: number;
};

function readFrameHeader(buffer: Buffer, offset: number): FrameHeader | undefined {
  if (offset + 2 > buffer.length) {
    return undefined;
  }

  const opcode = buffer[offset] & 0x0f;
  const masked = (buffer[offset + 1] & 0x80) !== 0;
  let length = buffer[offset + 1] & 0x7f;
  let cursor = offset + 2;

  if (length === 126) {
    if (cursor + 2 > buffer.length) {
      return undefined;
    }

    length = buffer.readUInt16BE(cursor);
    cursor += 2;
  } else if (length === 127) {
    if (cursor + 8 > buffer.length) {
      return undefined;
    }

    length = Number(buffer.readBigUInt64BE(cursor));
    cursor += 8;
  }

  const payloadOffset = cursor + (masked ? 4 : 0);
  const endOffset = payloadOffset + length;

  if (endOffset > buffer.length) {
    return undefined;
  }

  return {
    opcode,
    mask: buffer.subarray(cursor, payloadOffset),
    payloadOffset,
    endOffset,
  };
}

function readFramePayload(buffer: Buffer, header: FrameHeader) {
  const payload = Buffer.from(
    buffer.subarray(header.payloadOffset, header.endOffset),
  );

  if (header.mask.length > 0) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= header.mask[index % header.mask.length];
    }
  }

  return header.opcode === 0x1 ? payload.toString("utf8") : "";
}

export function readLiveFrames(buffer: Buffer) {
  const frames: LiveFrame[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const header = readFrameHeader(buffer, offset);

    if (header === undefined) {
      break;
    }

    frames.push({
      opcode: header.opcode,
      payload: readFramePayload(buffer, header),
    });
    offset = header.endOffset;
  }

  return {
    frames,
    rest: buffer.subarray(offset),
  };
}
