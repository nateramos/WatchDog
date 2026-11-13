import { defineAuth } from '@aws-amplify/backend'
import { defineAuthChallenge, createAuthChallenge, verifyAuthChallengeResponse } from './demo-sign-in/resource'

// Sign-in with Amazon Cognito. There is no public sign-up (see backend.ts): only accounts
// created in the Cognito console can log in. The three triggers let the judges' demo account,
// and only that account, sign in with one click and no password.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  triggers: {
    defineAuthChallenge,
    createAuthChallenge,
    verifyAuthChallengeResponse,
  },
})
