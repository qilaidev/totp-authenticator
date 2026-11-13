import { describe, expect, it } from "vitest";
import {
  base32Decode,
  counterFor,
  formatCode,
  generateTotp,
  isMigrationUri,
  isValidSecret,
  normalizeSecret,
  parseOtpAuth,
  parseScannedText,
  remainingSeconds,
} from "./totp";

/**
 * RFC 6238 Appendix B.
 *
 * The published vectors use ASCII seeds ("12345678901234567890", extended for
 * SHA256/SHA512), so they are converted to base32 here. Getting these to pass
 * is the whole point of the exercise: every other bug in this app is cosmetic
 * next to silently emitting codes that do not match the server's.
 */
function base32Encode(ascii: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of ascii) {
    bits += char.charCodeAt(0).toString(2).padStart(8, "0");
  }
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    out += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  return out;
}

const SEED_SHA1 = base32Encode("12345678901234567890");
const SEED_SHA256 = base32Encode("12345678901234567890123456789012");
const SEED_SHA512 = base32Encode(
  "1234567890123456789012345678901234567890123456789012345678901234",
);

describe("generateTotp — RFC 6238 test vectors", () => {
  const cases: Array<[number, string, "SHA1" | "SHA256" | "SHA512", string]> = [
    [59, SEED_SHA1, "SHA1", "94287082"],
    [59, SEED_SHA256, "SHA256", "46119246"],
    [59, SEED_SHA512, "SHA512", "90693936"],
    [1111111109, SEED_SHA1, "SHA1", "07081804"],
    [1111111111, SEED_SHA1, "SHA1", "14050471"],
    [1234567890, SEED_SHA1, "SHA1", "89005924"],
    [2000000000, SEED_SHA1, "SHA1", "69279037"],
    [20000000000, SEED_SHA1, "SHA1", "65353130"],
    [1111111109, SEED_SHA256, "SHA256", "68084774"],
    [1234567890, SEED_SHA256, "SHA256", "91819424"],
    [20000000000, SEED_SHA256, "SHA256", "77737706"],
    [1111111109, SEED_SHA512, "SHA512", "25091201"],
    [1234567890, SEED_SHA512, "SHA512", "93441116"],
    [20000000000, SEED_SHA512, "SHA512", "47863826"],
  ];

  for (const [seconds, secret, algorithm, expected] of cases) {
    it(`${algorithm} @ ${seconds} → ${expected}`, async () => {
      const code = await generateTotp(
        { secret, algorithm, digits: 8, period: 30 },
        seconds * 1000,
      );
      expect(code).toBe(expected);
    });
  }

  it("truncates to 6 digits by default", async () => {
    const code = await generateTotp({ secret: SEED_SHA1 }, 59_000);
    expect(code).toBe("287082");
  });

  it("stays correct past the 32-bit counter rollover (year 2106)", async () => {
    // 20000000000s is already beyond 2**32 seconds; the low-word-only counter
    // the original app wrote would produce a different code here.
    const code = await generateTotp({ secret: SEED_SHA1, digits: 8 }, 20000000000 * 1000);
    expect(code).toBe("65353130");
  });

  it("is constant across a whole period and changes at the boundary", async () => {
    const at = 1_700_000_000_000;
    const start = Math.floor(at / 30_000) * 30_000;
    const a = await generateTotp({ secret: SEED_SHA1 }, start);
    const b = await generateTotp({ secret: SEED_SHA1 }, start + 29_999);
    const c = await generateTotp({ secret: SEED_SHA1 }, start + 30_000);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("rejects a secret with characters outside the base32 alphabet", async () => {
    await expect(generateTotp({ secret: "ABCDEF01" })).rejects.toThrow("INVALID_SECRET");
  });
});

describe("base32Decode", () => {
  it("decodes RFC 4648 vectors", () => {
    const decode = (s: string) => new TextDecoder().decode(base32Decode(s));
    expect(decode("MY======")).toBe("f");
    expect(decode("MZXQ====")).toBe("fo");
    expect(decode("MZXW6===")).toBe("foo");
    expect(decode("MZXW6YQ=")).toBe("foob");
    expect(decode("MZXW6YTB")).toBe("fooba");
    expect(decode("MZXW6YTBOI======")).toBe("foobar");
  });

  it("tolerates spaces, dashes and lower case the way providers print them", () => {
    expect(Array.from(base32Decode("mzxw-6ytb oi"))).toEqual(
      Array.from(base32Decode("MZXW6YTBOI")),
    );
  });

  it("throws instead of silently skipping junk (the original's bug)", () => {
    expect(() => base32Decode("MZXW6YTB1")).toThrow("INVALID_SECRET");
    expect(() => base32Decode("hello world!")).toThrow("INVALID_SECRET");
  });
});

describe("isValidSecret", () => {
  it("accepts real-world secrets", () => {
    expect(isValidSecret("JBSWY3DPEHPK3PXP")).toBe(true);
    expect(isValidSecret("jbswy3dp ehpk3pxp")).toBe(true);
    expect(isValidSecret("JBSWY3DPEHPK3PXP====")).toBe(true);
  });

  it("rejects what the original accepted", () => {
    expect(isValidSecret("")).toBe(false);
    expect(isValidSecret("SHORT")).toBe(false);
    expect(isValidSecret("JBSWY3DP0EHPK")).toBe(false); // 0 and 1 are not base32
    expect(isValidSecret("JBSWY3DP1EHPK")).toBe(false);
    expect(isValidSecret("你好你好你好你好")).toBe(false);
  });
});

describe("normalizeSecret", () => {
  it("strips separators and padding, and upper-cases", () => {
    expect(normalizeSecret(" jbsw y3dp-ehpk_3pxp== ")).toBe("JBSWY3DPEHPK3PXP");
  });
});

describe("parseOtpAuth", () => {
  it("reads issuer, account, digits, period and algorithm", () => {
    const entry = parseOtpAuth(
      "otpauth://totp/ACME%20Co:john%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&digits=8&period=60&algorithm=SHA256",
    );
    expect(entry).toEqual({
      remark: "ACME Co · john@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "ACME Co",
      digits: 8,
      period: 60,
      algorithm: "SHA256",
    });
  });

  it("falls back to the label issuer and omits defaults", () => {
    const entry = parseOtpAuth("otpauth://totp/GitHub:ww?secret=JBSWY3DPEHPK3PXP");
    expect(entry?.remark).toBe("GitHub · ww");
    expect(entry?.digits).toBeUndefined();
    expect(entry?.period).toBeUndefined();
    expect(entry?.algorithm).toBeUndefined();
  });

  it("rejects hotp, bad secrets and non-URIs", () => {
    expect(parseOtpAuth("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1")).toBeNull();
    expect(parseOtpAuth("otpauth://totp/x?secret=NOT_BASE32_0")).toBeNull();
    expect(parseOtpAuth("https://example.com")).toBeNull();
    expect(parseOtpAuth("JBSWY3DPEHPK3PXP")).toBeNull();
  });

  it("clamps a hostile period instead of freezing the countdown", () => {
    expect(parseOtpAuth("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=0")?.period)
      .toBeUndefined();
    expect(parseOtpAuth("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=1e9")?.period)
      .toBeUndefined();
    expect(parseOtpAuth("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=-30")?.period)
      .toBeUndefined();
  });

  it("does not treat a label as HTML (the original wrote it into innerHTML)", () => {
    const entry = parseOtpAuth(
      "otpauth://totp/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E?secret=JBSWY3DPEHPK3PXP",
    );
    // React escapes on render; what matters here is that parsing keeps it as text.
    expect(entry?.remark).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("parseScannedText", () => {
  it("accepts a bare secret and leaves the remark for the user", () => {
    expect(parseScannedText(" jbswy3dp ehpk3pxp ")).toEqual({
      remark: "",
      secret: "JBSWY3DPEHPK3PXP",
    });
  });

  it("returns null for unrelated QR payloads", () => {
    expect(parseScannedText("https://example.com/promo")).toBeNull();
  });
});

describe("isMigrationUri", () => {
  it("recognises Google Authenticator's bulk export code", () => {
    expect(isMigrationUri("otpauth-migration://offline?data=AAAA")).toBe(true);
    expect(isMigrationUri("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP")).toBe(false);
  });
});

describe("clock helpers", () => {
  it("counterFor matches the RFC time-step definition", () => {
    expect(counterFor(30, 59_000)).toBe(1);
    expect(counterFor(30, 1111111109_000)).toBe(0x23523ec);
  });

  it("remainingSeconds counts down to 1 and wraps to the full period", () => {
    expect(remainingSeconds(30, 0)).toBe(30);
    expect(remainingSeconds(30, 1_000)).toBe(29);
    expect(remainingSeconds(30, 29_000)).toBe(1);
    expect(remainingSeconds(30, 30_000)).toBe(30);
  });

  it("formatCode groups like Google Authenticator", () => {
    expect(formatCode("317639")).toBe("317 639");
    expect(formatCode("12345678")).toBe("1234 5678");
    expect(formatCode("1234567")).toBe("1234 567");
    expect(formatCode("123")).toBe("123");
  });
});
