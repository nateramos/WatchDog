import { defineAuth } from '@aws-amplify/backend'

// Sign-in with Amazon Cognito. There is no public sign-up (see backend.ts): only accounts
// created in the Cognito console can log in.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
})
