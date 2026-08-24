package com.adrianpelaez.aptus;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.ReadRecordsRequestUsingFilters;
import android.health.connect.ReadRecordsResponse;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.BodyFatRecord;
import android.health.connect.datatypes.DataOrigin;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.SleepSessionRecord;
import android.health.connect.datatypes.StepsRecord;
import android.health.connect.datatypes.WeightRecord;
import android.os.Build;

import androidx.activity.result.ActivityResultLauncher;
import androidx.health.connect.client.PermissionController;
import androidx.health.connect.client.contracts.HealthPermissionsRequestContract;
import android.os.OutcomeReceiver;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;


@CapacitorPlugin(name = "HealthConnect")
public class HealthConnectPlugin
        extends Plugin {

    private ActivityResultLauncher<Set<String>>
            permissionLauncher;

    private PluginCall permissionRequestCall;

    private static final int MINIMUM_SDK = 34;


    @Override
    public void load() {
        super.load();

        permissionLauncher =
                getActivity()
                        .registerForActivityResult(
                                PermissionController
                                        .createRequestPermissionResultContract(),
                                grantedPermissions -> {
                                    PluginCall pendingCall =
                                            permissionRequestCall;

                                    permissionRequestCall =
                                            null;

                                    if (pendingCall == null) {
                                        return;
                                    }

                                    JSObject result =
                                            new JSObject();

                                    result.put(
                                            "granted",
                                            grantedPermissions.size()
                                    );

                                    result.put(
                                            "allGranted",
                                            grantedPermissions.containsAll(
                                                    requiredPermissions()
                                            )
                                    );

                                    pendingCall.resolve(
                                            result
                                    );
                                }
                        );
    }


    private Set<String> requiredPermissions() {
        return Set.of(
                "android.permission.health.READ_STEPS",
                "android.permission.health.READ_EXERCISE",
                "android.permission.health.READ_RESTING_HEART_RATE",
                "android.permission.health.READ_SLEEP",
                "android.permission.health.READ_WEIGHT",
                "android.permission.health.READ_BODY_FAT"
        );
    }


    private boolean isSupported() {
        return Build.VERSION.SDK_INT >= MINIMUM_SDK;
    }


    private HealthConnectManager manager() {
        if (!isSupported()) {
            return null;
        }

        return getContext().getSystemService(
                HealthConnectManager.class
        );
    }


    private boolean hasHealthPermission(
            String permission
    ) {
        if (!isSupported()) {
            return false;
        }

        return getContext().checkSelfPermission(
                permission
        ) == PackageManager.PERMISSION_GRANTED;
    }


    @PluginMethod
    public void isAvailable(
            PluginCall call
    ) {
        JSObject result =
                new JSObject();

        HealthConnectManager manager =
                manager();

        result.put(
                "supported",
                manager != null
        );

        result.put(
                "sdkInt",
                Build.VERSION.SDK_INT
        );

        result.put(
                "minimumSdkInt",
                MINIMUM_SDK
        );

        call.resolve(result);
    }


    @PluginMethod
    public void permissionStatus(
            PluginCall call
    ) {
        JSObject result =
                new JSObject();

        boolean steps =
                hasHealthPermission(
                        "android.permission.health.READ_STEPS"
                );

        boolean exercise =
                hasHealthPermission(
                        "android.permission.health.READ_EXERCISE"
                );

        boolean restingHeartRate =
                hasHealthPermission(
                        "android.permission.health.READ_RESTING_HEART_RATE"
                );

        boolean sleep =
                hasHealthPermission(
                        "android.permission.health.READ_SLEEP"
                );

        boolean weight =
                hasHealthPermission(
                        "android.permission.health.READ_WEIGHT"
                );

        boolean bodyFat =
                hasHealthPermission(
                        "android.permission.health.READ_BODY_FAT"
                );

        result.put(
                "steps",
                steps
        );

        result.put(
                "exercise",
                exercise
        );

        result.put(
                "restingHeartRate",
                restingHeartRate
        );

        result.put(
                "sleep",
                sleep
        );

        result.put(
                "weight",
                weight
        );

        result.put(
                "bodyFat",
                bodyFat
        );

        result.put(
                "allGranted",
                steps &&
                exercise &&
                restingHeartRate &&
                sleep &&
                weight &&
                bodyFat
        );

        call.resolve(result);
    }


    @PluginMethod
    public void openPermissions(
            PluginCall call
    ) {
        if (!isSupported()) {
            call.reject(
                    "Health Connect requiere Android 14 o superior."
            );
            return;
        }

        if (permissionLauncher == null) {
            call.reject(
                    "El gestor de permisos de Health Connect no está disponible."
            );
            return;
        }

        if (permissionRequestCall != null) {
            call.reject(
                    "Ya hay una solicitud de permisos en curso."
            );
            return;
        }

        permissionRequestCall =
                call;

        try {
            permissionLauncher.launch(
                    requiredPermissions()
            );
        } catch (Exception exception) {
            permissionRequestCall =
                    null;

            call.reject(
                    "No se pudo solicitar acceso a Health Connect: " +
                    exception,
                    exception
            );
        }
    }




    @PluginMethod
    public void readGarminExerciseSessions(
            PluginCall call
    ) {
        final HealthConnectManager manager =
                manager();

        if (manager == null) {
            call.reject(
                    "Health Connect no está disponible."
            );
            return;
        }

        if (
                !hasHealthPermission(
                        "android.permission.health.READ_EXERCISE"
                )
        ) {
            call.reject(
                    "Falta el permiso READ_EXERCISE."
            );
            return;
        }

        final String garminPackage =
                "com.garmin.android.apps.connectmobile";

        final Instant end =
                Instant.now();

        final Instant start =
                end.minus(
                        Duration.ofDays(30)
                );

        final DataOrigin garminOrigin =
                new DataOrigin.Builder()
                        .setPackageName(
                                garminPackage
                        )
                        .build();

        ReadRecordsRequestUsingFilters<
                ExerciseSessionRecord
                > request =
                new ReadRecordsRequestUsingFilters
                        .Builder<>(
                                ExerciseSessionRecord.class
                        )
                        .setTimeRangeFilter(
                                instantFilter(
                                        start,
                                        end
                                )
                        )
                        .addDataOrigins(
                                garminOrigin
                        )
                        .setAscending(false)
                        .setPageSize(50)
                        .build();

        final Executor executor =
                getContext().getMainExecutor();

        manager.readRecords(
                request,
                executor,
                new OutcomeReceiver<
                        ReadRecordsResponse<
                                ExerciseSessionRecord
                                >,
                        HealthConnectException
                        >() {

                    @Override
                    public void onResult(
                            ReadRecordsResponse<
                                    ExerciseSessionRecord
                                    > result
                    ) {
                        JSArray sessions =
                                new JSArray();

                        for (
                                ExerciseSessionRecord record :
                                result.getRecords()
                        ) {
                            JSObject session =
                                    new JSObject();

                            session.put(
                                    "exerciseType",
                                    record.getExerciseType()
                            );

                            session.put(
                                    "startTime",
                                    record
                                            .getStartTime()
                                            .toString()
                            );

                            session.put(
                                    "endTime",
                                    record
                                            .getEndTime()
                                            .toString()
                            );

                            session.put(
                                    "durationMinutes",
                                    Duration
                                            .between(
                                                    record.getStartTime(),
                                                    record.getEndTime()
                                            )
                                            .toMinutes()
                            );

                            session.put(
                                    "sourcePackage",
                                    sourceOf(record)
                            );

                            CharSequence title =
                                    record.getTitle();

                            if (title != null) {
                                session.put(
                                        "title",
                                        title.toString()
                                );
                            }

                            CharSequence notes =
                                    record.getNotes();

                            if (notes != null) {
                                session.put(
                                        "notes",
                                        notes.toString()
                                );
                            }

                            session.put(
                                    "lapCount",
                                    record
                                            .getLaps()
                                            .size()
                            );

                            session.put(
                                    "segmentCount",
                                    record
                                            .getSegments()
                                            .size()
                            );

                            session.put(
                                    "hasRoute",
                                    record.hasRoute()
                            );

                            sessions.put(
                                    session
                            );
                        }

                        JSObject response =
                                new JSObject();

                        response.put(
                                "sourcePackage",
                                garminPackage
                        );

                        response.put(
                                "lookbackDays",
                                30
                        );

                        response.put(
                                "count",
                                sessions.length()
                        );

                        response.put(
                                "sessions",
                                sessions
                        );

                        call.resolve(
                                response
                        );
                    }

                    @Override
                    public void onError(
                            HealthConnectException error
                    ) {
                        call.reject(
                                "No se pudieron leer las sesiones Garmin: " +
                                error,
                                error
                        );
                    }
                }
        );
    }



    @PluginMethod
    public void readSnapshot(
            PluginCall call
    ) {
        final HealthConnectManager manager =
                manager();

        if (manager == null) {
            call.reject(
                    "Health Connect no está disponible."
            );
            return;
        }


        final String[] requiredPermissions = {
                "android.permission.health.READ_STEPS",
                "android.permission.health.READ_RESTING_HEART_RATE",
                "android.permission.health.READ_SLEEP",
                "android.permission.health.READ_WEIGHT",
                "android.permission.health.READ_BODY_FAT"
        };

        for (
                String permission :
                requiredPermissions
        ) {
            if (!hasHealthPermission(permission)) {
                call.reject(
                        "Faltan permisos de Health Connect."
                );
                return;
            }
        }


        final JSObject snapshot =
                new JSObject();

        final AtomicInteger pending =
                new AtomicInteger(5);

        final AtomicBoolean failed =
                new AtomicBoolean(false);

        final Executor executor =
                getContext().getMainExecutor();


        Runnable finishPart =
                () -> {
                    if (
                            pending.decrementAndGet() == 0 &&
                            !failed.get()
                    ) {
                        call.resolve(snapshot);
                    }
                };


        java.util.function.Consumer<Throwable>
                fail =
                error -> {
                    if (
                            failed.compareAndSet(
                                    false,
                                    true
                            )
                    ) {
                        call.reject(
                                "No se pudieron leer los datos de Health Connect: " +
                                error.getMessage()
                        );
                    }
                };


        readStepsToday(
                manager,
                executor,
                snapshot,
                finishPart,
                fail
        );

        readRestingHeartRate(
                manager,
                executor,
                snapshot,
                finishPart,
                fail
        );

        readSleep(
                manager,
                executor,
                snapshot,
                finishPart,
                fail
        );

        readWeight(
                manager,
                executor,
                snapshot,
                finishPart,
                fail
        );

        readBodyFat(
                manager,
                executor,
                snapshot,
                finishPart,
                fail
        );
    }


    private void readStepsToday(
            HealthConnectManager manager,
            Executor executor,
            JSObject snapshot,
            Runnable finishPart,
            java.util.function.Consumer<Throwable> fail
    ) {
        ZoneId zone =
                ZoneId.systemDefault();

        Instant start =
                ZonedDateTime
                        .now(zone)
                        .toLocalDate()
                        .atStartOfDay(zone)
                        .toInstant();

        Instant end =
                Instant.now();

        TimeInstantRangeFilter filter =
                new TimeInstantRangeFilter
                        .Builder()
                        .setStartTime(start)
                        .setEndTime(end)
                        .build();

        DataOrigin garminOrigin =
                new DataOrigin.Builder()
                        .setPackageName(
                                "com.garmin.android.apps.connectmobile"
                        )
                        .build();

        AggregateRecordsRequest<Long> request =
                new AggregateRecordsRequest
                        .Builder<Long>(
                                filter
                        )
                        .addAggregationType(
                                StepsRecord
                                        .STEPS_COUNT_TOTAL
                        )
                        .addDataOriginsFilter(
                                garminOrigin
                        )
                        .build();

        manager.aggregate(
                request,
                executor,
                new OutcomeReceiver<
                        AggregateRecordsResponse<Long>,
                        HealthConnectException
                        >() {

                    @Override
                    public void onResult(
                            AggregateRecordsResponse<Long>
                                    result
                    ) {
                        Long steps =
                                result.get(
                                        StepsRecord
                                                .STEPS_COUNT_TOTAL
                                );

                        if (steps != null) {
                            snapshot.put(
                                    "stepsToday",
                                    steps
                            );
                        }

                        JSArray sources =
                                new JSArray();

                        Set<DataOrigin> origins =
                                result.getDataOrigins(
                                        StepsRecord
                                                .STEPS_COUNT_TOTAL
                                );

                        for (
                                DataOrigin origin :
                                origins
                        ) {
                            sources.put(
                                    origin.getPackageName()
                            );
                        }

                        snapshot.put(
                                "stepsSources",
                                sources
                        );

                        finishPart.run();
                    }


                    @Override
                    public void onError(
                            HealthConnectException error
                    ) {
                        fail.accept(error);
                    }
                }
        );
    }


    private void readRestingHeartRate(
            HealthConnectManager manager,
            Executor executor,
            JSObject snapshot,
            Runnable finishPart,
            java.util.function.Consumer<Throwable> fail
    ) {
        Instant end =
                Instant.now();

        Instant start =
                end.minus(
                        Duration.ofDays(30)
                );

        ReadRecordsRequestUsingFilters<
                RestingHeartRateRecord
                > request =
                new ReadRecordsRequestUsingFilters
                        .Builder<>(
                                RestingHeartRateRecord.class
                        )
                        .setTimeRangeFilter(
                                instantFilter(
                                        start,
                                        end
                                )
                        )
                        .setAscending(false)
                        .setPageSize(1)
                        .build();

        manager.readRecords(
                request,
                executor,
                new OutcomeReceiver<
                        ReadRecordsResponse<
                                RestingHeartRateRecord
                                >,
                        HealthConnectException
                        >() {

                    @Override
                    public void onResult(
                            ReadRecordsResponse<
                                    RestingHeartRateRecord
                                    > result
                    ) {
                        List<RestingHeartRateRecord>
                                records =
                                result.getRecords();

                        if (!records.isEmpty()) {
                            RestingHeartRateRecord record =
                                    records.get(0);

                            snapshot.put(
                                    "restingHeartRate",
                                    record
                                            .getBeatsPerMinute()
                            );

                            snapshot.put(
                                    "restingHeartRateAt",
                                    record
                                            .getTime()
                                            .toString()
                            );

                            snapshot.put(
                                    "restingHeartRateSource",
                                    sourceOf(record)
                            );
                        }

                        finishPart.run();
                    }


                    @Override
                    public void onError(
                            HealthConnectException error
                    ) {
                        fail.accept(error);
                    }
                }
        );
    }


    private void readSleep(
            HealthConnectManager manager,
            Executor executor,
            JSObject snapshot,
            Runnable finishPart,
            java.util.function.Consumer<Throwable> fail
    ) {
        Instant end =
                Instant.now();

        Instant start =
                end.minus(
                        Duration.ofDays(7)
                );

        ReadRecordsRequestUsingFilters<
                SleepSessionRecord
                > request =
                new ReadRecordsRequestUsingFilters
                        .Builder<>(
                                SleepSessionRecord.class
                        )
                        .setTimeRangeFilter(
                                instantFilter(
                                        start,
                                        end
                                )
                        )
                        .setAscending(false)
                        .setPageSize(1)
                        .build();

        manager.readRecords(
                request,
                executor,
                new OutcomeReceiver<
                        ReadRecordsResponse<
                                SleepSessionRecord
                                >,
                        HealthConnectException
                        >() {

                    @Override
                    public void onResult(
                            ReadRecordsResponse<
                                    SleepSessionRecord
                                    > result
                    ) {
                        List<SleepSessionRecord>
                                records =
                                result.getRecords();

                        if (!records.isEmpty()) {
                            SleepSessionRecord record =
                                    records.get(0);

                            long minutes =
                                    Duration
                                            .between(
                                                    record.getStartTime(),
                                                    record.getEndTime()
                                            )
                                            .toMinutes();

                            snapshot.put(
                                    "sleepMinutes",
                                    minutes
                            );

                            snapshot.put(
                                    "sleepStart",
                                    record
                                            .getStartTime()
                                            .toString()
                            );

                            snapshot.put(
                                    "sleepEnd",
                                    record
                                            .getEndTime()
                                            .toString()
                            );

                            snapshot.put(
                                    "sleepSource",
                                    sourceOf(record)
                            );
                        }

                        finishPart.run();
                    }


                    @Override
                    public void onError(
                            HealthConnectException error
                    ) {
                        fail.accept(error);
                    }
                }
        );
    }


    private void readWeight(
            HealthConnectManager manager,
            Executor executor,
            JSObject snapshot,
            Runnable finishPart,
            java.util.function.Consumer<Throwable> fail
    ) {
        Instant end =
                Instant.now();

        Instant start =
                end.minus(
                        Duration.ofDays(30)
                );

        ReadRecordsRequestUsingFilters<
                WeightRecord
                > request =
                new ReadRecordsRequestUsingFilters
                        .Builder<>(
                                WeightRecord.class
                        )
                        .setTimeRangeFilter(
                                instantFilter(
                                        start,
                                        end
                                )
                        )
                        .setAscending(false)
                        .setPageSize(1)
                        .build();

        manager.readRecords(
                request,
                executor,
                new OutcomeReceiver<
                        ReadRecordsResponse<
                                WeightRecord
                                >,
                        HealthConnectException
                        >() {

                    @Override
                    public void onResult(
                            ReadRecordsResponse<
                                    WeightRecord
                                    > result
                    ) {
                        List<WeightRecord> records =
                                result.getRecords();

                        if (!records.isEmpty()) {
                            WeightRecord record =
                                    records.get(0);

                            snapshot.put(
                                    "weightKg",
                                    record
                                            .getWeight()
                                            .getInGrams()
                                            / 1000.0
                            );

                            snapshot.put(
                                    "weightAt",
                                    record
                                            .getTime()
                                            .toString()
                            );

                            snapshot.put(
                                    "weightSource",
                                    sourceOf(record)
                            );
                        }

                        finishPart.run();
                    }


                    @Override
                    public void onError(
                            HealthConnectException error
                    ) {
                        fail.accept(error);
                    }
                }
        );
    }


    private void readBodyFat(
            HealthConnectManager manager,
            Executor executor,
            JSObject snapshot,
            Runnable finishPart,
            java.util.function.Consumer<Throwable> fail
    ) {
        Instant end =
                Instant.now();

        Instant start =
                end.minus(
                        Duration.ofDays(30)
                );

        ReadRecordsRequestUsingFilters<
                BodyFatRecord
                > request =
                new ReadRecordsRequestUsingFilters
                        .Builder<>(
                                BodyFatRecord.class
                        )
                        .setTimeRangeFilter(
                                instantFilter(
                                        start,
                                        end
                                )
                        )
                        .setAscending(false)
                        .setPageSize(1)
                        .build();

        manager.readRecords(
                request,
                executor,
                new OutcomeReceiver<
                        ReadRecordsResponse<
                                BodyFatRecord
                                >,
                        HealthConnectException
                        >() {

                    @Override
                    public void onResult(
                            ReadRecordsResponse<
                                    BodyFatRecord
                                    > result
                    ) {
                        List<BodyFatRecord> records =
                                result.getRecords();

                        if (!records.isEmpty()) {
                            BodyFatRecord record =
                                    records.get(0);

                            snapshot.put(
                                    "bodyFatPercentage",
                                    record
                                            .getPercentage()
                                            .getValue()
                            );

                            snapshot.put(
                                    "bodyFatAt",
                                    record
                                            .getTime()
                                            .toString()
                            );

                            snapshot.put(
                                    "bodyFatSource",
                                    sourceOf(record)
                            );
                        }

                        finishPart.run();
                    }


                    @Override
                    public void onError(
                            HealthConnectException error
                    ) {
                        fail.accept(error);
                    }
                }
        );
    }


    private TimeInstantRangeFilter
    instantFilter(
            Instant start,
            Instant end
    ) {
        return new TimeInstantRangeFilter
                .Builder()
                .setStartTime(start)
                .setEndTime(end)
                .build();
    }


    private String sourceOf(
            android.health.connect.datatypes.Record
                    record
    ) {
        try {
            return record
                    .getMetadata()
                    .getDataOrigin()
                    .getPackageName();
        } catch (Exception ignored) {
            return "";
        }
    }
}
