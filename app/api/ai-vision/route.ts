import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imageMime,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: 'Please extract all room numbers and their housekeeping statuses from this PMS screenshot. Return only a JSON array as specified.',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return NextResponse.json(
        { error: err?.error?.message ?? 'Claude API error' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const text = data.content
      ?.map((c: { type: string; text?: string }) => c.text ?? '')
      .join('') ?? '';

    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({ rooms: parsed });
  } catch (err) {
    console.error('AI Vision route error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
