import { describe, test, expect } from "bun:test"
import { Identifier } from "../src/id/id.ts"

describe("Identifier.insert", () => {
  test("with gap: returns ID that sorts between afterId and beforeId", () => {
    const after = "msg_b7e7d206c001" + "41AJzGoP7rJBng"
    const before = "msg_b7e7d206c005" + "Wj03KLMi4c7fXc"
    const result = Identifier.insert(after, before, "message")

    expect(after < result).toBe(true)
    expect(result < before).toBe(true)
  })

  test("with gap of 1: returns ID after afterId (fallback behavior)", () => {
    const after = "msg_b7e7d206c001" + "41AJzGoP7rJBng"
    const before = "msg_b7e7d206c002" + "Wj03KLMi4c7fXc"
    const result = Identifier.insert(after, before, "message")

    // When gap is too small, creates after afterId (may be > before)
    expect(after < result).toBe(true)
  })

  test("with same hex: returns ID after afterId (fallback behavior)", () => {
    const after = "msg_b7e7d206c001" + "41AJzGoP7rJBng"
    const before = "msg_b7e7d206c001" + "Wj03KLMi4c7fXc"
    const result = Identifier.insert(after, before, "message")

    expect(after < result).toBe(true)
  })

  test("without beforeId: returns ID after afterId", () => {
    const after = "msg_b7e7d206c001" + "41AJzGoP7rJBng"
    const result = Identifier.insert(after, undefined, "message")

    expect(after < result).toBe(true)
  })

  test("works with real sequential IDs", () => {
    const id1 = Identifier.create("message", false)
    const id2 = Identifier.create("message", false)
    const id3 = Identifier.create("message", false)

    // Create between id1 and id3
    const result = Identifier.insert(id1, id3, "message")

    expect(id1 < result).toBe(true)
    // Note: result may or may not be < id3 depending on gap size
  })

  test("works for part IDs", () => {
    const msgId = Identifier.create("message", false)
    const partId = Identifier.insert(msgId, undefined, "part")

    expect(partId.startsWith("prt_")).toBe(true)
    // Part ID should sort after the message ID (comparing just the hex portion)
    const msgHex = msgId.slice(4, 16)
    const partHex = partId.slice(4, 16)
    expect(msgHex < partHex).toBe(true)
  })

  test("with large gap: inserts in middle", () => {
    const id1 = Identifier.create("message", false)
    // Manually create an ID with larger gap
    const hex1 = id1.slice(4, 16)
    const val1 = BigInt("0x" + hex1)
    const val2 = val1 + BigInt(100000) // Add significant gap
    const hex2 = val2.toString(16).padStart(12, "0")
    const id2 = "msg_" + hex2 + "randomrandom12"

    const result = Identifier.insert(id1, id2, "message")
    expect(id1 < result).toBe(true)
    expect(result < id2).toBe(true)
  })
})

describe("localeCompare issue", () => {
  test("localeCompare produces different order than direct comparison for mixed case", () => {
    const ids = ["msg_b7e7d206c001A", "msg_b7e7d206c001a", "msg_b7e7d206c001B", "msg_b7e7d206c001b"]

    const locale = [...ids].sort((a, b) => a.localeCompare(b))
    const direct = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    // They should be different (demonstrating why we use direct comparison)
    expect(JSON.stringify(locale)).not.toBe(JSON.stringify(direct))
  })
})

describe("ID format", () => {
  test("all created IDs are 6-byte format (12 hex chars)", () => {
    const ids = Array.from({ length: 10 }, () => Identifier.create("message", false))
    for (const id of ids) {
      // ID format: prefix_ + 12 hex chars + 14 random chars = prefix_ + 26 chars
      const afterUnderscore = id.slice(4)
      expect(afterUnderscore.length).toBe(26)
      // First 12 chars should be valid hex
      const hexPart = afterUnderscore.slice(0, 12)
      expect(/^[0-9a-f]{12}$/i.test(hexPart)).toBe(true)
    }
  })
})
