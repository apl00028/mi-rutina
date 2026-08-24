package com.adrianpelaez.aptus;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PasskeyPlugin.class);
        registerPlugin(HealthConnectPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
