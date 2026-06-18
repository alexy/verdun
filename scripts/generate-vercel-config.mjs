import { readFile, writeFile } from 'node:fs/promises'
import { defaultDeployCheckProfileId, deployCheckProfile, supportedDeployCheckProfiles } from './instances/deploy-check-profiles.mjs'

const outputPath = 'vercel.json'
const checkOnly = process.argv.includes('--check')
const defaultProfile = deployCheckProfile(defaultDeployCheckProfileId())
if (!defaultProfile?.basePath) {
  throw new Error('default deploy profile must define basePath before generating vercel.json')
}

const profiles = supportedDeployCheckProfiles()
  .filter((profile) => profile.basePath && profile.basePath !== '/')
  .sort((left, right) => left.basePath.localeCompare(right.basePath))

const config = {
  framework: 'vite',
  buildCommand: 'npm run prod:build',
  outputDirectory: 'dist-prod',
  redirects: [
    {
      source: '/',
      destination: defaultProfile.basePath,
      permanent: false,
    },
  ],
  rewrites: [
    ...profiles.flatMap((profile) => [
      {
        source: `${profile.basePath}assets/(.*)`,
        destination: '/assets/$1',
      },
      {
        source: `${profile.basePath}data/(.*)`,
        destination: '/data/$1',
      },
      {
        source: `${profile.basePath}(.*)`,
        destination: '/index.html',
      },
    ]),
    {
      source: '/api/(.*)',
      destination: '/api/$1',
    },
    {
      source: '/(.*)',
      destination: '/index.html',
    },
  ],
}

const rendered = `${JSON.stringify(config, null, 2)}\n`

if (checkOnly) {
  const current = await readFile(outputPath, 'utf8')
  if (current !== rendered) {
    throw new Error(`${outputPath} is out of date; run npm run vercel:config`)
  }
} else {
  await writeFile(outputPath, rendered)
  console.log(`wrote ${outputPath} for ${profiles.map((profile) => profile.id).join(', ')}`)
}
