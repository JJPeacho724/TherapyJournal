import OpenAI from 'openai'

// Initialize OpenAI client (server-side only)
export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }
  
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

// Default model configuration
export const DEFAULT_MODEL = 'gpt-4-turbo-preview'
export const EMBEDDING_MODEL = 'text-embedding-3-small'

// Token limits
export const MAX_TOKENS = {
  extraction: 1000,
  chat: 2000,
  guided_prompt: 500,
}

// Temperature settings
export const TEMPERATURE = {
  extraction: 0.3, // More deterministic for extraction
  chat: 0.7, // More creative for conversation
  guided_prompt: 0.8, // Creative prompts
}

// Helper to create chat completion
export async function createChatCompletion(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: {
    model?: string
    maxTokens?: number
    temperature?: number
  } = {}
) {
  const client = getOpenAIClient()
  
  const response = await client.chat.completions.create({
    model: options.model ?? DEFAULT_MODEL,
    messages,
    max_tokens: options.maxTokens ?? MAX_TOKENS.chat,
    temperature: options.temperature ?? TEMPERATURE.chat,
  })

  return response.choices[0]?.message?.content ?? ''
}

// Helper to create embeddings
export async function createEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient()
  
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })

  return response.data[0].embedding
}

// Helper to create batch embeddings
export async function createBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getOpenAIClient()
  
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  })

  return response.data.map((item) => item.embedding)
}

