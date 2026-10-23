import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const MODEL = 'gemini-3.1-flash-lite';

const systemPrompt = `... (tempel prompt lamamu di sini, tidak perlu diubah) ...`;

async function callGemini(body: unknown, tries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  let res: Response | undefined;
  for (let i = 0; i < tries; i++) {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok || ![429, 500, 503].includes(res.status)) return res;
    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  return res!;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY belum di-set di Vercel.' }, { status: 500 });
    }
    const { imageBase64, imageMime } = await req.json();
    if (!imageBase64 || !imageMime) {
      return NextResponse.json({ error: 'Missing image data' }, { status: 400 });
    }

    const response = await callGemini({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: imageMime, data: imageBase64 } },
          { text: 'Extract all room numbers and housekeeping statuses. Return only a JSON array.' },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Gemini error', response.status, err);
      return NextResponse.json(
        { error: err?.error?.message ?? `Gemini API error (${response.status})` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p.text ?? '').join('');
    const cleaned = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Invalid JSON from AI:', text);
      return NextResponse.json({ error: 'Respons AI bukan JSON valid. Coba lagi.' }, { status: 500 });
    }
    return NextResponse.json({ rooms: parsed });
  } catch (err) {
    console.error('AI Vision route error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
