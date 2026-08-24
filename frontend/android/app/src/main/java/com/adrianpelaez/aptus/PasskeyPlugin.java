package com.adrianpelaez.aptus;

import android.os.Build;
import android.os.CancellationSignal;

import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePublicKeyCredentialRequest;
import androidx.credentials.CreatePublicKeyCredentialResponse;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPublicKeyCredentialOption;
import androidx.credentials.PublicKeyCredential;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;


@CapacitorPlugin(name = "Passkey")
public class PasskeyPlugin extends Plugin {

    private CredentialManager credentialManager;


    @Override
    public void load() {
        credentialManager =
            CredentialManager.create(
                getContext()
            );
    }


    @PluginMethod
    public void isSupported(
        PluginCall call
    ) {
        boolean supported =
            Build.VERSION.SDK_INT >=
            Build.VERSION_CODES.P;

        JSObject result =
            new JSObject();

        result.put(
            "supported",
            supported
        );

        result.put(
            "sdkInt",
            Build.VERSION.SDK_INT
        );

        result.put(
            "minimumSdkInt",
            Build.VERSION_CODES.P
        );

        call.resolve(result);
    }


    @PluginMethod
    public void createCredential(
        PluginCall call
    ) {
        String requestJson =
            call.getString(
                "requestJson"
            );

        if (
            requestJson == null ||
            requestJson.isBlank()
        ) {
            call.reject(
                "requestJson is required."
            );

            return;
        }

        if (
            Build.VERSION.SDK_INT <
            Build.VERSION_CODES.P
        ) {
            call.reject(
                "Passkeys require Android 9 or newer."
            );

            return;
        }

        CreatePublicKeyCredentialRequest request;

        try {
            request =
                new CreatePublicKeyCredentialRequest(
                    requestJson,
                    null,
                    false,
                    null,
                    false,
                    false
                );
        } catch (
            IllegalArgumentException exception
        ) {
            call.reject(
                "Invalid WebAuthn registration options.",
                exception
            );

            return;
        }

        credentialManager.createCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(
                getContext()
            ),
            new CredentialManagerCallback<
                CreateCredentialResponse,
                CreateCredentialException
            >() {

                @Override
                public void onResult(
                    CreateCredentialResponse result
                ) {
                    if (
                        !(result instanceof
                            CreatePublicKeyCredentialResponse)
                    ) {
                        call.reject(
                            "Unexpected credential response type."
                        );

                        return;
                    }

                    CreatePublicKeyCredentialResponse
                        passkeyResponse =
                            (CreatePublicKeyCredentialResponse)
                                result;

                    JSObject response =
                        new JSObject();

                    response.put(
                        "credentialJson",
                        passkeyResponse
                            .getRegistrationResponseJson()
                    );

                    call.resolve(
                        response
                    );
                }


                @Override
                public void onError(
                    CreateCredentialException exception
                ) {
                    call.reject(
                        "Passkey registration failed: " +
                        exception.getMessage(),
                        exception
                    );
                }
            }
        );
    }


    @PluginMethod
    public void getCredential(
        PluginCall call
    ) {
        String requestJson =
            call.getString(
                "requestJson"
            );

        if (
            requestJson == null ||
            requestJson.isBlank()
        ) {
            call.reject(
                "requestJson is required."
            );

            return;
        }

        if (
            Build.VERSION.SDK_INT <
            Build.VERSION_CODES.P
        ) {
            call.reject(
                "Passkeys require Android 9 or newer."
            );

            return;
        }

        GetPublicKeyCredentialOption option;

        try {
            option =
                new GetPublicKeyCredentialOption(
                    requestJson,
                    null,
                    Collections.emptySet()
                );
        } catch (
            IllegalArgumentException exception
        ) {
            call.reject(
                "Invalid WebAuthn authentication options.",
                exception
            );

            return;
        }

        GetCredentialRequest request =
            new GetCredentialRequest(
                Collections.singletonList(
                    option
                ),
                null,
                false,
                null,
                false
            );

        credentialManager.getCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(
                getContext()
            ),
            new CredentialManagerCallback<
                GetCredentialResponse,
                GetCredentialException
            >() {

                @Override
                public void onResult(
                    GetCredentialResponse result
                ) {
                    Credential credential =
                        result.getCredential();

                    if (
                        !(credential instanceof
                            PublicKeyCredential)
                    ) {
                        call.reject(
                            "Unexpected credential type."
                        );

                        return;
                    }

                    PublicKeyCredential passkey =
                        (PublicKeyCredential)
                            credential;

                    JSObject response =
                        new JSObject();

                    response.put(
                        "credentialJson",
                        passkey
                            .getAuthenticationResponseJson()
                    );

                    call.resolve(
                        response
                    );
                }


                @Override
                public void onError(
                    GetCredentialException exception
                ) {
                    call.reject(
                        "Passkey authentication failed: " +
                        exception.getMessage(),
                        exception
                    );
                }
            }
        );
    }
}
