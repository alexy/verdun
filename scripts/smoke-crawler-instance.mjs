import { spawnSync } from 'node:child_process'

const verifyGarbage = spawnSync('cargo', [
  'run',
  '--manifest-path',
  'crawler/Cargo.toml',
  '--',
  'verify',
  '--instance',
  'garbage',
], { encoding: 'utf8' })

if (verifyGarbage.error) throw verifyGarbage.error
if (verifyGarbage.status !== 0) {
  throw new Error(`garbage instance verification failed\n${verifyGarbage.stdout}\n${verifyGarbage.stderr}`)
}
if (!verifyGarbage.stdout.includes('verified garbage instance')) {
  throw new Error('garbage instance verification did not report the selected instance')
}

const verifyUnknown = spawnSync('cargo', [
  'run',
  '--manifest-path',
  'crawler/Cargo.toml',
  '--',
  'verify',
  '--instance',
  'greathouse',
], { encoding: 'utf8' })

if (verifyUnknown.error) throw verifyUnknown.error
if (verifyUnknown.status === 0) {
  throw new Error('unsupported greathouse crawler instance should fail until a real instance is implemented')
}
if (!verifyUnknown.stderr.includes('unknown crawler instance "greathouse"')) {
  throw new Error(`unsupported instance failure did not explain the selected instance\n${verifyUnknown.stdout}\n${verifyUnknown.stderr}`)
}
