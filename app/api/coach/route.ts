export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return Response.json({ error: 'Set GEMINI_API_KEY on the server to enable AI feedback.' }, { status: 503 })

  try {
    const body = await request.json() as { piece?: unknown; lessonFeedback?: unknown; lessonResult?: unknown }
    const piece = typeof body.piece === 'string' ? body.piece.slice(0, 120) : 'a piano lesson'
    const timing = typeof body.lessonFeedback === 'string' ? body.lessonFeedback.slice(0, 800) : ''
    if (!timing) return Response.json({ error: 'Missing timing feedback.' }, { status: 400 })

    const result = typeof body.lessonResult === 'object' && body.lessonResult ? JSON.stringify(body.lessonResult).slice(0, 300) : ''
    const prompt = `You are a concise, encouraging piano teacher. Give 2-4 sentences of concrete practice advice for ${piece}. Use these measured lesson results: ${timing} ${result}. Explain what the timing percentage/late notes mean in plain language. Do not invent accuracy, dynamics, or technique data that was not measured. Focus on timing and the next small exercise.`
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.35, maxOutputTokens: 220 } }),
    })
    if (!response.ok) return Response.json({ error: 'Gemini could not generate feedback right now.' }, { status: 502 })
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const feedback = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim()
    if (!feedback) return Response.json({ error: 'Gemini returned no feedback.' }, { status: 502 })
    return Response.json({ feedback })
  } catch {
    return Response.json({ error: 'Unable to process the AI feedback request.' }, { status: 500 })
  }
}
