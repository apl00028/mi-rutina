package com.adrianpelaez.gymos;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PasskeyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
