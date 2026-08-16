export type Delivery = { providerMessageId: string; status: "Sent" };
export interface WhatsAppProvider { sendReminder(to: string, message: string, template: { name: string; language: string }): Promise<Delivery>; getDeliveryStatus(id: string): Promise<string | null>; }
export const reminderMessages = ["🔥 You haven't solved today's LeetCode problem yet. Just one problem — let's keep the streak alive!", "💻 5 minutes is enough to get started. Solve one LeetCode problem today.", "⚡ Your streak is waiting. One LeetCode problem and you're done for today!", "🎯 Daily goal: 1 problem. Open LeetCode and get it done."];
class MockProvider implements WhatsAppProvider { async sendReminder() { return { providerMessageId: `mock_${crypto.randomUUID()}`, status: "Sent" as const }; } async getDeliveryStatus() { return "Sent"; } }
class MetaProvider implements WhatsAppProvider {
  async sendReminder(to: string, message: string, template: { name: string; language: string }) {
    const response = await fetch(`https://graph.facebook.com/v22.0/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`, { method: "POST", headers: { Authorization: `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: template.name, language: { code: template.language }, components: [{ type: "body", parameters: [{ type: "text", text: message }] }] } }) });
    if (!response.ok) throw new Error(`Meta API request failed (${response.status})`); const body = await response.json() as { messages?: { id: string }[] };
    return { providerMessageId: body.messages?.[0]?.id || crypto.randomUUID(), status: "Sent" as const };
  }
  async getDeliveryStatus() { return null; }
}
export function whatsappProvider(): WhatsAppProvider { return process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID ? new MetaProvider() : new MockProvider(); }
export const isMockMode = () => !(process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID);
