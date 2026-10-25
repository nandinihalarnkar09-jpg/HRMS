import type { ToolCallRecord } from './tool-impl';

/** "Numbers come from code": a reply that states day counts without any tool call is replaced. */
export function guardUnsupportedNumbers(text: string, calls: Pick<ToolCallRecord, 'tool'>[]): string {
  const claimsNumber = /\b\d+(\.\d+)?\s*(days?|din|CL|SL|EL|leaves?|chutti|chhutti|holidays?)\b/i.test(text);
  if (claimsNumber && calls.length === 0) {
    return "I need to check that in the system before giving you a number. Please ask again (for example: \"How many CL do I have?\").";
  }
  return text;
}
