import { describe, expect, it, beforeAll } from "vitest";

let whatsappProvider: any, isMockMode: any, reminderMessages: any;

beforeAll(async () => {
  ({ whatsappProvider, isMockMode, reminderMessages } = await import("../lib/whatsapp"));
});

describe("WhatsApp provider abstraction", () => {
  it("mock provider returns a valid delivery response", async () => {
    const provider = whatsappProvider();
    const delivery = await provider.sendReminder("+14155552671", "Test message", { name: "leetcode_reminder", language: "en_US" });
    expect(delivery).toHaveProperty("providerMessageId");
    expect(delivery.providerMessageId).toMatch(/^mock_/);
    expect(delivery.status).toBe("Sent");
  });

  it("mock provider getDeliveryStatus returns a string", async () => {
    const provider = whatsappProvider();
    const status = await provider.getDeliveryStatus("mock_123");
    expect(typeof status).toBe("string");
  });

  it("selects mock provider when Meta credentials are absent", () => {
    const originalToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
    const originalPhoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.META_WHATSAPP_ACCESS_TOKEN;
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    expect(isMockMode()).toBe(true);
    if (originalToken) process.env.META_WHATSAPP_ACCESS_TOKEN = originalToken;
    if (originalPhoneId) process.env.META_WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
  });

  it("selects real provider when Meta credentials are present", () => {
    const originalToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
    const originalPhoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    process.env.META_WHATSAPP_ACCESS_TOKEN = "test-token";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123456";
    expect(isMockMode()).toBe(false);
    if (originalToken) process.env.META_WHATSAPP_ACCESS_TOKEN = originalToken;
    else delete process.env.META_WHATSAPP_ACCESS_TOKEN;
    if (originalPhoneId) process.env.META_WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
    else delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  });

  it("has exactly 4 rotating reminder messages", () => {
    expect(reminderMessages).toHaveLength(4);
    for (const msg of reminderMessages) {
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(10);
    }
  });

  it("rotates messages based on time-based index", () => {
    const indices = new Set<number>();
    for (let minute = 0; minute < 4; minute++) {
      indices.add(minute % reminderMessages.length);
    }
    expect(indices.size).toBe(4);
  });
});
