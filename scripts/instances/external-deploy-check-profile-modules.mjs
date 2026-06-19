export const externalDeployCheckProfileModules = (process.env.VERDUN_EXTERNAL_DEPLOY_CHECK_PROFILE_MODULES ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
