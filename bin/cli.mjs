#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
import { daily } from '../src/daily.mjs'

const args = process.argv.slice(2)

try {
  const report = await daily({ replan: args.includes('--replan') })
  console.log(`\n${report}`)
  // In GitHub Actions the report also becomes the run summary.
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report)
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
