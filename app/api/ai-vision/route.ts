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
- dirty: room needs cleaning (Dirty, Vac. Dirty, Vacant Dirty)
- clean: room is clean but not yet inspected (Vac. Clean Unchecked, Vacant Clean Unchecked, Clean)
- inspected: room is clean and inspected/checked (Vac. Clean Checked, Vacant Clean Checked, Inspected)
- occupied: room is currently occupied by a guest (Occupied, Occupied Cleaned, Occupied Dirty)
- vacant: room is vacant with no specific cleaning status (Vacant)
- out_of_order: room is out of order (Out of Order, OOO, OO)
IMPORTANT RULES:
- Only extract rows that clearly have a room number (numeric like 301, 422, 508)
- Ignore header rows, footer rows, and any rows without a clear room number
- If the status is ambiguous, map it to the closest match from the list above
- Return ONLY a JSON array, no explanation, no markdown, no backticks
- Format: [{"roomNumber":"301","status":"clean"},{"roomNumber":"302","status":"occupied"}]`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
