import { NextRequest, NextResponse } from 'next/server';
export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not set on the server. Add it in Vercel → Settings → Environment Variables, then redeploy.' },
        { status: 500 }
      );
    }
    const { imageBase64, imageMime } = await req.json();
    if (!imageBase64 || !imageMime) {
      return NextResponse.json({ error: 'Missing image data' }, { status: 400 });
    }
    const systemPrompt = `You are a hotel PMS (Property Management System) data extractor.
Your job is to read a screenshot of a hotel PMS and extract room numbers with their housekeeping status.
Map the PMS status text to exactly one of these system statuses:
- vacant_dirty: room is vacant and needs cleaning (Dirty, Vac. Dirty, Vacant Dirty)
- vacant_clean: room is vacant, clean but not yet inspected (Vac. Clean Unchecked, Vacant Clean Unchecked, Clean)
- vacant_clean_inspected: room is vacant, clean and inspected/checked (Vac. Clean Checked, Vacant Clean Checked, Inspected, Vac. Clean Checked AA)
- occupied_clean: room is occupied by a guest and clean (Occupied Cleaned, Occupied Clean)
- occupied_dirty: room is occupied by a guest and needs cleaning (Occupied Dirty, Occupied)
- expected_departure: room is occupied but guest is checking out today (Expected Departure, Expected Departure DD, Exp. Departure)
- out_of_order: room is out of order (Out of Order, OOO, OO)
- off_market: room is off market / not available for sale (Off Market, OM)
IMPORTANT RULES:
- Only extract rows that clearly have a room number (numeric like 301, 422, 508)
- Ignore header rows, footer rows, and any rows without a clear room number
- If the status is ambiguous, map it to the closest match from the list above
- If a status only says "Occupied" with no clean/dirty indication, map it to occupied_dirty
- If a status only says "Vacant" with no clean/dirty indication, map it to vacant_dirty
- Return ONLY a JSON array, no explanation, no markdown, no backticks
- Format: [{"roomNumber":"301","status":"vacant_clean"},{"roomNumber":"302","status":"occupied_dirty"}]`;
    const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: imageMime, data: imageBase64 } },
                { text: 'Please extract all room numbers and their housekeeping statuses from this PMS screenshot. Return only a JSON array as specified.' },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      }
    );
    if (!response.ok) {
      const err = await response.json();
      return NextResponse.json(
        { error: err?.error?.message ?? 'Gemini API error' },
        { status: response.status }
      );
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: 'AI response was not valid JSON. Try a clearer screenshot.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ rooms: parsed });
  } catch (err) {
    console.error('AI Vision route error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
