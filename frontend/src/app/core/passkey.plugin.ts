import { registerPlugin } from '@capacitor/core';


export interface PasskeySupportResult {
  supported: boolean;
  sdkInt: number;
  minimumSdkInt: number;
}


export interface PasskeyCredentialResult {
  credentialJson: string;
}


export interface PasskeyPlugin {
  isSupported():
    Promise<PasskeySupportResult>;

  createCredential(
    options: {
      requestJson: string;
    }
  ): Promise<PasskeyCredentialResult>;

  getCredential(
    options: {
      requestJson: string;
    }
  ): Promise<PasskeyCredentialResult>;
}


export const Passkey =
  registerPlugin<PasskeyPlugin>(
    'Passkey'
  );
