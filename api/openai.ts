import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * API Route: /api/openai
 * Intermediaria segura para llamadas a OpenAI
 * La key se usa SOLO en el servidor, nunca se expone al cliente
 */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Validar método
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[API] OPENAI_API_KEY or VITE_OPENAI_API_KEY not configured');
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    const { messages, model = 'gpt-4o-mini', temperature = 0.6, max_tokens = 200 } = req.body;

    console.log('[API] OpenAI request:', { model, messagesCount: messages?.length });

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    // Llamar a OpenAI desde el servidor (SEGURO - la key no viaja por internet)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[API] OpenAI error:', response.status, error.substring(0, 200));
      return res.status(response.status).json({
        error: `OpenAI API error: ${response.status}`,
        details: error.substring(0, 200)
      });
    }

    const data = await response.json();
    console.log('[API] ✅ OpenAI response received');

    // Retornar SOLO la respuesta de OpenAI (nunca la key)
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('[API] Error:', error.message);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
