import type { DefineAuthChallengeTriggerHandler } from 'aws-lambda'

// One-click sign-in for the demo account only. Cognito asks one custom question; the demo
// account passes it, and any other account trying this route is turned away (they sign in
// with their password instead).
export const handler: DefineAuthChallengeTriggerHandler = async (event) => {
  const isDemo = event.request.userAttributes.email === process.env.DEMO_EMAIL
  const session = event.request.session

  if (!isDemo || event.request.userNotFound) {
    event.response.issueTokens = false
    event.response.failAuthentication = true
  } else if (session.length === 0) {
    event.response.challengeName = 'CUSTOM_CHALLENGE'
    event.response.issueTokens = false
    event.response.failAuthentication = false
  } else if (session.at(-1)?.challengeResult) {
    event.response.issueTokens = true
    event.response.failAuthentication = false
  } else {
    event.response.issueTokens = false
    event.response.failAuthentication = true
  }
  return event
}
