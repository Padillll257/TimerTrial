// Serverless function deployed by Vercel at /api/trials.
//
// Storage: a Redis database attached via the Vercel Marketplace "Redis"
// integration — the classic TCP-based kind, reached through a single
// REDIS_URL connection string (as opposed to Upstash's separate REST URL +
// token pair). Vercel injects REDIS_URL automatically once that
// integration is connected to this project and the project is redeployed.
//
// Data model: a single JSON array of trials is kept (as a JSON string,
// since node-redis doesn't auto-serialize like some REST clients do) under
// one Redis key. This app is a single-operator trial logger, not a
// multi-tenant service, so a single list is enough — no per-user
// partitioning needed.

import { createClient } from 'redis'

const TRIALS_KEY = 'timertrial:trials'

// Reused across warm serverless invocations instead of reconnecting on
// every request. Cached at module scope so concurrent requests hitting the
// same warm instance share one in-flight connect() call instead of racing
// to open multiple sockets.
let clientPromise = null

function getClientPromise() {
  if (!process.env.REDIS_URL) return null
  if (!clientPromise) {
    const client = createClient({ url: process.env.REDIS_URL })
    // node-redis throws unhandled errors if nothing listens for 'error' —
    // this just logs so a transient network blip doesn't crash the
    // function process.
    client.on('error', (err) => console.error('[api/trials] redis client error:', err))
    clientPromise = client.connect().then(() => client)
  }
  return clientPromise
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

  const pendingClient = getClientPromise()
  if (!pendingClient) {
    res.status(503).json({
      error: 'Storage not configured. Attach a Redis integration to this Vercel project (REDIS_URL missing).'
    })
    return
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const client = await pendingClient

    if (req.method === 'GET') {
      const raw = await client.get(TRIALS_KEY)
      const trials = raw ? JSON.parse(raw) : []
      res.status(200).json({ trials })
      return
    }

    if (req.method === 'POST') {
      const trial = req.body
      if (!trial || typeof trial !== 'object' || Array.isArray(trial)) {
        res.status(400).json({ error: 'Body must be a single trial object.' })
        return
      }

      const raw = await client.get(TRIALS_KEY)
      const trials = raw ? JSON.parse(raw) : []
      trials.push(trial)
      await client.set(TRIALS_KEY, JSON.stringify(trials))
      res.status(201).json({ trials })
      return
    }

    if (req.method === 'DELETE') {
      await client.del(TRIALS_KEY)
      res.status(200).json({ trials: [] })
      return
    }

    res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS')
    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/trials] storage error:', err)
    // Don't let a broken/expired connection poison future warm-start
    // invocations — force the next request to reconnect from scratch.
    clientPromise = null
    res.status(500).json({ error: 'Storage error' })
  }
}