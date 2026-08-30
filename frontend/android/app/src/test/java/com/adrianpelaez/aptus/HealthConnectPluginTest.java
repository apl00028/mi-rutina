package com.adrianpelaez.aptus;

import android.health.connect.datatypes.ExerciseSessionType;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;


public class HealthConnectPluginTest {

    @Test
    public void runningTypeIsIncluded() {
        assertTrue(
                HealthConnectPlugin.isRunningExerciseType(
                        ExerciseSessionType
                                .EXERCISE_SESSION_TYPE_RUNNING
                )
        );
    }


    @Test
    public void treadmillRunningTypeIsIncluded() {
        assertTrue(
                HealthConnectPlugin.isRunningExerciseType(
                        ExerciseSessionType
                                .EXERCISE_SESSION_TYPE_RUNNING_TREADMILL
                )
        );
    }


    @Test
    public void nonRunningTypeIsExcluded() {
        assertFalse(
                HealthConnectPlugin.isRunningExerciseType(
                        ExerciseSessionType
                                .EXERCISE_SESSION_TYPE_SWIMMING_POOL
                )
        );
    }


    @Test
    public void pacePerKilometerUsesAverageSpeed() {
        assertEquals(
                250.0,
                HealthConnectPlugin.paceSecondsForDistance(
                        4.0,
                        1000.0
                ),
                0.0001
        );
    }


    @Test
    public void missingSpeedDoesNotProducePace() {
        assertNull(
                HealthConnectPlugin.paceSecondsForDistance(
                        0.0,
                        1000.0
                )
        );
    }


    @Test
    public void swimmingPaceScaleRemainsUnchanged() {
        assertEquals(
                50.0,
                HealthConnectPlugin.paceSecondsForDistance(
                        2.0,
                        100.0
                ),
                0.0001
        );
    }
}
