import { createEmbedding, createBatchEmbeddings } from './openai'
import { createServerSupabaseClient } from './supabase-server'
import type { EmbeddingSearchResult } from '@/types'

// Chunk text into smaller pieces for embedding
export function chunkText(text: string, maxChunkSize: number = 500): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  let currentChunk = ''

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim())
      currentChunk = sentence
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter(chunk => chunk.length > 10) // Filter out tiny chunks
}

// Store embeddings for a journal entry
export async function storeEntryEmbeddings(
  entryId: string,
  content: string
): Promise<void> {
  const supabase = await createServerSupabaseClient()
  
  // Delete existing embeddings for this entry
  await supabase
    .from('entry_embeddings')
    .delete()
    .eq('entry_id', entryId)

  // Chunk the content
  const chunks = chunkText(content)
  
  if (chunks.length === 0) return

  // Create embeddings for all chunks
  const embeddings = await createBatchEmbeddings(chunks)

  // Store embeddings
  const embeddingRecords = chunks.map((chunk, index) => ({
    entry_id: entryId,
    chunk_text: chunk,
    embedding: JSON.stringify(embeddings[index]),
  }))

  await supabase.from('entry_embeddings').insert(embeddingRecords)
}

// Search for similar entries using semantic search
export async function searchSimilarEntries(
  patientId: string,
  query: string,
  limit: number = 5
): Promise<EmbeddingSearchResult[]> {
  const supabase = await createServerSupabaseClient()
  
  // Create embedding for the query
  const queryEmbedding = await createEmbedding(query)

  // Search using pgvector similarity
  const { data, error } = await supabase.rpc('match_entry_embeddings', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_patient_id: patientId,
    match_threshold: 0.7,
    match_count: limit,
  })

  if (error) {
    console.error('Embedding search error:', error)
    return []
  }

  return data.map((item: { entry_id: string; chunk_text: string; similarity: number }) => ({
    entry_id: item.entry_id,
    chunk_text: item.chunk_text,
    similarity: item.similarity,
  }))
}

// Get context from similar entries for chat
export async function getRetrievalContext(
  patientId: string,
  query: string,
  limit: number = 3
): Promise<string> {
  const results = await searchSimilarEntries(patientId, query, limit)
  
  if (results.length === 0) {
    return ''
  }

  const context = results
    .map((r, i) => `[Past Entry ${i + 1}]: ${r.chunk_text}`)
    .join('\n\n')

  return context
}

