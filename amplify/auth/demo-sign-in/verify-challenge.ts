import type { VerifyAuthChallengeResponseTriggerHandler } from 'aws-lambda'

// Correct only for the demo account, whatever is typed: the demo needs no password.
export const handler: VerifyAuthChallengeResponseTriggerHandler = async (event) => {
  event.response.answerCorrect = event.request.userAttributes.email === process.env.DEMO_EMAIL
  return event
}
