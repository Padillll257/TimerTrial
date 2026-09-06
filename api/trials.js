// Serverless function deployed by Vercel at /api/trials.
//
// Storage: Upstash Redis, reached through the Vercel Marketplace "Redis"
// integration. Once that integration is attached to the project, Vercel
// injects UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN automatically —
// no manual .env wiring needed for a production deploy.
// (Vercel's own first-party "Vercel KV" product was sunset and migrated to
// Upstash, so Upstash is the current supported path for this kind of
// small, serverless key-value storage.)
//
// Data model: a single JSON array of trials is kept under one Redis key.
// This app is a single-operator trial logger, not a multi-tenant service,
// so a single list is enough — no need for per-user partitioning.

import { Redis } from '@upstash/redis'

const TRIALS_KEY = 'timertrial:trials'

function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  return Redis.fromEnv()
}

// Optional write protection: set TRIAL_LOG_API_KEY in the Vercel project's
// environment variables and the frontend will send it back as `x-api-key`.
// Leave it unset during local dev / low-stakes use and every request is
// allowed.
function isAuthorized(req) {
  const requiredKey = process.env.TRIAL_LOG_API_KEY
  if (!requiredKey) return true
  return req.headers['x-api-key'] === requiredKey
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const redis = getRedis()
  if (!redis) {
    res.status(503).json({
      error: 'Storage not configured. Attach an Upstash Redis integration to this Vercel project.'
    })
    return
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    if (req.method === 'GET') {
      const trials = (await redis.get(TRIALS_KEY)) || []
      res.status(200).json({ trials })
      return
    }

    if (req.method === 'POST') {
      const trial = req.body
      if (!trial || typeof trial !== 'object' || Array.isArray(trial)) {
        res.status(400).json({ error: 'Body must be a single trial object.' })
        return
      }

      const trials = (await redis.get(TRIALS_KEY)) || []
      trials.push(trial)
      await redis.set(TRIALS_KEY, trials)
      res.status(201).json({ trials })
      return
    }

    if (req.method === 'DELETE') {
      await redis.del(TRIALS_KEY)
      res.status(200).json({ trials: [] })
      return
    }

    res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS')
    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/trials] storage error:', err)
    res.status(500).json({ error: 'Storage error' })
  }
}