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
import android.health.connect.datatypes.DistanceRecord;
import android.health.connect.datatypes.ExerciseLap;
import android.health.connect.datatypes.ExerciseSegment;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.ExerciseSessionType;
import android.health.connect.datatypes.HeartRateRecord;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.SleepSessionRecord;
import android.health.connect.datatypes.SpeedRecord;
import android.health.connect.datatypes.StepsRecord;
import android.health.connect.datatypes.WeightRecord;
import android.health.connect.datatypes.units.Length;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;


@CapacitorPlugin(name = "HealthConnect")
public class HealthConnectPlugin
        extends Plugin {

    private ActivityResultLauncher<Set<String>>
            permissionLauncher;

    private PluginCall permissionRequestCall;

    private static final int MINIMUM_SDK = 34;


    static boolean isRunningExerciseType(
            int exerciseType
    ) {
        return exerciseType ==
                ExerciseSessionType
                        .EXERCISE_SESSION_TYPE_RUNNING ||
                exerciseType ==
                        ExerciseSessionType
                                .EXERCISE_SESSION_TYPE_RUNNING_TREADMILL;
    }


    static Double paceSecondsForDistance(
            double averageSpeedMetersPerSecond,
            double distanceMeters
    ) {
        if (
                !Double.isFinite(
                        averageSpeedMetersPerSecond
                ) ||
                averageSpeedMetersPerSecond <= 0 ||
                !Double.isFinite(distanceMeters) ||
                distanceMeters <= 0
        ) {
            return null;
        }

        return distanceMeters /
                averageSpeedMetersPerSecond;
    }


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
                "android.permission.health.READ_DISTANCE",
                "android.permission.health.READ_SPEED",
                "android.permission.health.READ_HEART_RATE",
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

        boolean distance =
                hasHealthPermission(
                        "android.permission.health.READ_DISTANCE"
                );

        boolean speed =
                hasHealthPermission(
                        "android.permission.health.READ_SPEED"
                );

        boolean heartRate =
                hasHealthPermission(
                        "android.permission.health.READ_HEART_RATE"
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
                "distance",
                distance
        );

        result.put(
                "speed",
                speed
        );

        result.put(
                "heartRate",
                heartRate
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
                distance &&
                speed &&
                heartRate &&
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

        final Executor executor =
                getContext().getMainExecutor();

        readExerciseSessionPages(
                manager,
                executor,
                garminOrigin,
                start,
                end,
                false,
                -1,
                new ArrayList<>(),
                records -> {
                        JSArray sessions =
                                new JSArray();

                        for (
                                ExerciseSessionRecord record :
                                records
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

                            JSArray laps =
                                    new JSArray();

                            int lapIndex = 0;

                            for (
                                    ExerciseLap lap :
                                    record.getLaps()
                            ) {
                                JSObject item =
                                        new JSObject();

                                item.put(
                                        "index",
                                        lapIndex++
                                );

                                item.put(
                                        "startTime",
                                        lap
                                                .getStartTime()
                                                .toString()
                                );

                                item.put(
                                        "endTime",
                                        lap
                                                .getEndTime()
                                                .toString()
                                );

                                item.put(
                                        "durationSeconds",
                                        Duration
                                                .between(
                                                        lap.getStartTime(),
                                                        lap.getEndTime()
                                                )
                                                .toMillis()
                                                / 1000.0
                                );

                                android.health.connect.datatypes.units.Length
                                        length =
                                        lap.getLength();

                                if (length != null) {
                                    item.put(
                                            "lengthMeters",
                                            length.getInMeters()
                                    );
                                }

                                laps.put(item);
                            }

                            session.put(
                                    "laps",
                                    laps
                            );

                            JSArray segments =
                                    new JSArray();

                            int segmentIndex = 0;

                            for (
                                    ExerciseSegment segment :
                                    record.getSegments()
                            ) {
                                JSObject item =
                                        new JSObject();

                                item.put(
                                        "index",
                                        segmentIndex++
                                );

                                item.put(
                                        "segmentType",
                                        segment.getSegmentType()
                                );

                                item.put(
                                        "startTime",
                                        segment
                                                .getStartTime()
                                                .toString()
                                );

                                item.put(
                                        "endTime",
                                        segment
                                                .getEndTime()
                                                .toString()
                                );

                                item.put(
                                        "durationSeconds",
                                        Duration
                                                .between(
                                                        segment.getStartTime(),
                                                        segment.getEndTime()
                                                )
                                                .toMillis()
                                                / 1000.0
                                );

                                item.put(
                                        "repetitionsCount",
                                        segment
                                                .getRepetitionsCount()
                                );

                                segments.put(item);
                            }

                            session.put(
                                    "segments",
                                    segments
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
                    },

                error -> {
                        call.reject(
                                "No se pudieron leer las sesiones Garmin: " +
                                error,
                                error
                        );
                }
        );
    }


    private void readExerciseSessionPages(
            HealthConnectManager manager,
            Executor executor,
            DataOrigin origin,
            Instant start,
            Instant end,
            boolean ascending,
            long pageToken,
            ArrayList<ExerciseSessionRecord> records,
            Consumer<List<ExerciseSessionRecord>> onResult,
            Consumer<Exception> onError
    ) {
        ReadRecordsRequestUsingFilters.Builder<
                ExerciseSessionRecord
                > builder =
                new ReadRecordsRequestUsingFilters
                        .Builder<>(
                                ExerciseSessionRecord.class
                        )
                        .setTimeRangeFilter(
                                instantFilter(start, end)
                        )
                        .addDataOrigins(origin)
                        .setAscending(ascending)
                        .setPageSize(50);

        if (pageToken != -1) {
            builder.setPageToken(pageToken);
        }

        try {
            manager.readRecords(
                    builder.build(),
                    executor,
                    new OutcomeReceiver<
                            ReadRecordsResponse<ExerciseSessionRecord>,
                            HealthConnectException
                            >() {

                        @Override
                        public void onResult(
                                ReadRecordsResponse<ExerciseSessionRecord>
                                        result
                        ) {
                            records.addAll(
                                    result.getRecords()
                            );

                            long nextPageToken =
                                    result.getNextPageToken();

                            if (nextPageToken == -1) {
                                onResult.accept(records);
                                return;
                            }

                            readExerciseSessionPages(
                                    manager,
                                    executor,
                                    origin,
                                    start,
                                    end,
                                    ascending,
                                    nextPageToken,
                                    records,
                                    onResult,
                                    onError
                            );
                        }

                        @Override
                        public void onError(
                                HealthConnectException error
                        ) {
                            onError.accept(error);
                        }
                    }
            );
        } catch (Exception exception) {
            onError.accept(exception);
        }
    }



    @PluginMethod
    public void readGarminSwimmingMetrics(
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

        final String[] permissions = {
                "android.permission.health.READ_EXERCISE",
                "android.permission.health.READ_DISTANCE",
                "android.permission.health.READ_SPEED",
                "android.permission.health.READ_HEART_RATE"
        };

        for (String permission : permissions) {
            if (!hasHealthPermission(permission)) {
                call.reject(
                        "Falta permiso para diagnóstico de natación: " +
                        permission
                );
                return;
            }
        }

        final String garminPackage =
                "com.garmin.android.apps.connectmobile";

        final DataOrigin garminOrigin =
                new DataOrigin.Builder()
                        .setPackageName(garminPackage)
                        .build();

        final Instant end =
                Instant.now();

        final Instant start =
                end.minus(
                        Duration.ofDays(30)
                );

        final Executor executor =
                getContext().getMainExecutor();

        readExerciseSessionPages(
                manager,
                executor,
                garminOrigin,
                start,
                end,
                false,
                -1,
                new ArrayList<>(),
                records -> {
                        ArrayList<
                                ExerciseSessionRecord
                                > swimmingSessions =
                                new ArrayList<>();

                        for (
                                ExerciseSessionRecord record :
                                records
                        ) {
                            if (
                                    record.getExerciseType() ==
                                    ExerciseSessionType
                                            .EXERCISE_SESSION_TYPE_SWIMMING_POOL
                            ) {
                                swimmingSessions.add(
                                        record
                                );
                            }
                        }

                        JSArray sessions =
                                new JSArray();

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
                                swimmingSessions.size()
                        );

                        response.put(
                                "sessions",
                                sessions
                        );

                        if (
                                swimmingSessions.isEmpty()
                        ) {
                            call.resolve(response);
                            return;
                        }

                        AtomicInteger pending =
                                new AtomicInteger(
                                        swimmingSessions.size()
                                                * 4
                                );

                        AtomicBoolean resolved =
                                new AtomicBoolean(false);

                        Runnable finishPart =
                                () -> {
                                    if (
                                            pending
                                                    .decrementAndGet()
                                                    == 0 &&
                                            resolved.compareAndSet(
                                                    false,
                                                    true
                                            )
                                    ) {
                                        call.resolve(
                                                response
                                        );
                                    }
                                };

                        for (
                                ExerciseSessionRecord record :
                                swimmingSessions
                        ) {
                            JSObject session =
                                    new JSObject();

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
                                    "durationSeconds",
                                    Duration
                                            .between(
                                                    record.getStartTime(),
                                                    record.getEndTime()
                                            )
                                            .toMillis()
                                            / 1000.0
                            );

                            session.put(
                                    "segmentCount",
                                    record
                                            .getSegments()
                                            .size()
                            );

                            long segmentRepetitions = 0;

                            // Garmin pool sessions expose total strokes through
                            // segment repetitions in the observed Fenix data.
                            for (
                                    ExerciseSegment segment :
                                    record.getSegments()
                            ) {
                                segmentRepetitions +=
                                        segment
                                                .getRepetitionsCount();
                            }

                            session.put(
                                    "segmentRepetitions",
                                    segmentRepetitions
                            );

                            session.put(
                                    "distanceRecordCount",
                                    0
                            );

                            session.put(
                                    "rawDistanceTotalMeters",
                                    0.0
                            );

                            session.put(
                                    "distanceRecords",
                                    new JSArray()
                            );

                            session.put(
                                    "heartRateSampleCount",
                                    0
                            );

                            session.put(
                                    "speedSampleCount",
                                    0
                            );

                            sessions.put(session);

                            launchMetricSubread(
                                    session,
                                    "distanceError",
                                    finishPart,
                                    done -> readExerciseDistance(
                                            manager,
                                            executor,
                                            garminOrigin,
                                            record.getStartTime(),
                                            record.getEndTime(),
                                            session,
                                            done
                                    )
                            );

                            launchMetricSubread(
                                    session,
                                    "distanceRecordsError",
                                    finishPart,
                                    done -> readSwimmingDistanceRecords(
                                            manager,
                                            executor,
                                            garminOrigin,
                                            record.getStartTime(),
                                            record.getEndTime(),
                                            session,
                                            done
                                    )
                            );

                            launchMetricSubread(
                                    session,
                                    "heartRateError",
                                    finishPart,
                                    done -> readExerciseHeartRate(
                                            manager,
                                            executor,
                                            garminOrigin,
                                            record.getStartTime(),
                                            record.getEndTime(),
                                            session,
                                            done
                                    )
                            );

                            launchMetricSubread(
                                    session,
                                    "speedError",
                                    finishPart,
                                    done -> readExerciseSpeed(
                                            manager,
                                            executor,
                                            garminOrigin,
                                            record.getStartTime(),
                                            record.getEndTime(),
                                            "paceSecondsPer100mFromSpeed",
                                            100.0,
                                            session,
                                            done
                                    )
                            );
                        }
                    },

                error -> {
                        call.reject(
                                "No se pudieron localizar las sesiones de natación: " +
                                error,
                                error
                        );
                }
        );
    }


    @PluginMethod
    public void readGarminRunningMetrics(
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

        final String[] permissions = {
                "android.permission.health.READ_EXERCISE",
                "android.permission.health.READ_DISTANCE",
                "android.permission.health.READ_SPEED",
                "android.permission.health.READ_HEART_RATE"
        };

        for (String permission : permissions) {
            if (!hasHealthPermission(permission)) {
                call.reject(
                        "Falta permiso para diagnóstico de carrera: " +
                        permission
                );
                return;
            }
        }

        final String garminPackage =
                "com.garmin.android.apps.connectmobile";

        final DataOrigin garminOrigin =
                new DataOrigin.Builder()
                        .setPackageName(garminPackage)
                        .build();

        final Instant end =
                Instant.now();

        final Instant start =
                end.minus(
                        Duration.ofDays(30)
                );

        final Executor executor =
                getContext().getMainExecutor();

        readExerciseSessionPages(
                manager,
                executor,
                garminOrigin,
                start,
                end,
                false,
                -1,
                new ArrayList<>(),
                records -> {
                    ArrayList<ExerciseSessionRecord>
                            runningSessions =
                            new ArrayList<>();

                    for (
                            ExerciseSessionRecord record :
                            records
                    ) {
                        if (
                                isRunningExerciseType(
                                        record.getExerciseType()
                                )
                        ) {
                            runningSessions.add(record);
                        }
                    }

                    JSArray sessions =
                            new JSArray();

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
                            runningSessions.size()
                    );

                    response.put(
                            "sessions",
                            sessions
                    );

                    if (runningSessions.isEmpty()) {
                        call.resolve(response);
                        return;
                    }

                    AtomicInteger pending =
                            new AtomicInteger(
                                    runningSessions.size()
                                            * 3
                            );

                    AtomicBoolean resolved =
                            new AtomicBoolean(false);

                    Runnable finishPart =
                            () -> {
                                if (
                                        pending
                                                .decrementAndGet()
                                                == 0 &&
                                        resolved.compareAndSet(
                                                false,
                                                true
                                        )
                                ) {
                                    call.resolve(response);
                                }
                            };

                    for (
                            ExerciseSessionRecord record :
                            runningSessions
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
                                "durationSeconds",
                                Duration
                                        .between(
                                                record.getStartTime(),
                                                record.getEndTime()
                                        )
                                        .toMillis()
                                        / 1000.0
                        );

                        session.put(
                                "lapCount",
                                record.getLaps().size()
                        );

                        session.put(
                                "segmentCount",
                                record.getSegments().size()
                        );

                        session.put(
                                "hasRoute",
                                record.hasRoute()
                        );

                        session.put(
                                "heartRateSampleCount",
                                0
                        );

                        session.put(
                                "speedSampleCount",
                                0
                        );

                        sessions.put(session);

                        launchMetricSubread(
                                session,
                                "distanceError",
                                finishPart,
                                done -> readExerciseDistance(
                                        manager,
                                        executor,
                                        garminOrigin,
                                        record.getStartTime(),
                                        record.getEndTime(),
                                        session,
                                        done
                                )
                        );

                        launchMetricSubread(
                                session,
                                "heartRateError",
                                finishPart,
                                done -> readExerciseHeartRate(
                                        manager,
                                        executor,
                                        garminOrigin,
                                        record.getStartTime(),
                                        record.getEndTime(),
                                        session,
                                        done
                                )
                        );

                        launchMetricSubread(
                                session,
                                "speedError",
                                finishPart,
                                done -> readExerciseSpeed(
                                        manager,
                                        executor,
                                        garminOrigin,
                                        record.getStartTime(),
                                        record.getEndTime(),
                                        "paceSecondsPerKmFromSpeed",
                                        1000.0,
                                        session,
                                        done
                                )
                        );
                    }
                },
                error -> call.reject(
                        "No se pudieron localizar las sesiones de carrera: " +
                        error,
                        error
                )
        );
    }


    private void launchMetricSubread(
            JSObject session,
            String errorField,
            Runnable finished,
            Consumer<Runnable> operation
    ) {
        AtomicBoolean completed =
                new AtomicBoolean(false);

        Runnable finishOnce =
                () -> {
                    if (
                            completed.compareAndSet(
                                    false,
                                    true
                            )
                    ) {
                        finished.run();
                    }
                };

        try {
            operation.accept(finishOnce);
        } catch (Exception exception) {
            session.put(
                    errorField,
                    exception.toString()
            );

            finishOnce.run();
        }
    }


    private void readExerciseDistance(
            HealthConnectManager manager,
            Executor executor,
            DataOrigin garminOrigin,
            Instant start,
            Instant end,
            JSObject session,
            Runnable done
    ) {
        AggregateRecordsRequest<Length> request =
                new AggregateRecordsRequest
                        .Builder<Length>(
                                instantFilter(
                                        start,
                                        end
                                )
                        )
                        .addAggregationType(
                                DistanceRecord
                                        .DISTANCE_TOTAL
                        )
                        .addDataOriginsFilter(
                                garminOrigin
                        )
                        .build();

        manager.aggregate(
                request,
                executor,
                new OutcomeReceiver<
                        AggregateRecordsResponse<Length>,
                        HealthConnectException
                        >() {

                    @Override
                    public void onResult(
                            AggregateRecordsResponse<Length>
                                    result
                    ) {
                        Length distance =
                                result.get(
                                        DistanceRecord
                                                .DISTANCE_TOTAL
                                );

                        if (distance != null) {
                            session.put(
                                    "distanceMeters",
                                    distance
                                            .getInMeters()
                            );
                        }

                        done.run();
                    }

                    @Override
                    public void onError(
                            HealthConnectException error
                    ) {
                        session.put(
                                "distanceError",
                                error.toString()
                        );

                        done.run();
                    }
                }
        );
    }


    private void readSwimmingDistanceRecords(
            HealthConnectManager manager,
            Executor executor,
            DataOrigin garminOrigin,
            Instant start,
            Instant end,
            JSObject session,
            Runnable done
    ) {
        readDistanceRecordPages(
                manager,
                executor,
                garminOrigin,
                start,
                end,
                -1,
                new ArrayList<>(),
                distanceRecords -> {
                        JSArray serializedRecords =
                                new JSArray();

                        double rawTotalMeters =
                                0.0;

                        for (
                                DistanceRecord record :
                                distanceRecords
                        ) {
                            JSObject item =
                                    new JSObject();

                            double meters =
                                    record
                                            .getDistance()
                                            .getInMeters();

                            rawTotalMeters +=
                                    meters;

                            item.put(
                                    "startTime",
                                    record
                                            .getStartTime()
                                            .toString()
                            );

                            item.put(
                                    "endTime",
                                    record
                                            .getEndTime()
                                            .toString()
                            );

                            item.put(
                                    "durationSeconds",
                                    Duration
                                            .between(
                                                    record.getStartTime(),
                                                    record.getEndTime()
                                            )
                                            .toMillis()
                                            / 1000.0
                            );

                            item.put(
                                    "distanceMeters",
                                    meters
                            );

                            serializedRecords.put(item);
                        }

                        session.put(
                                "distanceRecordCount",
                                serializedRecords.length()
                        );

                        session.put(
                                "rawDistanceTotalMeters",
                                rawTotalMeters
                        );

                        session.put(
                                "distanceRecords",
                                serializedRecords
                        );

                        done.run();
                    },
                error -> {
                        session.put(
                                "distanceRecordsError",
                                error.toString()
                        );

                        done.run();
                }
        );
    }


    private void readDistanceRecordPages(
            HealthConnectManager manager,
            Executor executor,
            DataOrigin origin,
            Instant start,
            Instant end,
            long pageToken,
            ArrayList<DistanceRecord> records,
            Consumer<List<DistanceRecord>> onResult,
            Consumer<Exception> onError
    ) {
        ReadRecordsRequestUsingFilters.Builder<
                DistanceRecord
                > builder =
                new ReadRecordsRequestUsingFilters
                        .Builder<>(DistanceRecord.class)
                        .setTimeRangeFilter(
                                instantFilter(start, end)
                        )
                        .addDataOrigins(origin)
                        .setAscending(true)
                        .setPageSize(100);

        if (pageToken != -1) {
            builder.setPageToken(pageToken);
        }

        try {
            manager.readRecords(
                    builder.build(),
                    executor,
                    new OutcomeReceiver<
                            ReadRecordsResponse<DistanceRecord>,
                            HealthConnectException
                            >() {

                        @Override
                        public void onResult(
                                ReadRecordsResponse<DistanceRecord>
                                        result
                        ) {
                            records.addAll(
                                    result.getRecords()
                            );

                            long nextPageToken =
                                    result.getNextPageToken();

                            if (nextPageToken == -1) {
                                onResult.accept(records);
                                return;
                            }

                            readDistanceRecordPages(
                                    manager,
                                    executor,
                                    origin,
                                    start,
                                    end,
                                    nextPageToken,
                                    records,
                                    onResult,
                                    onError
                            );
                        }

                        @Override
                        public void onError(
                                HealthConnectException error
                        ) {
                            onError.accept(error);
                        }
                    }
            );
        } catch (Exception exception) {
            onError.accept(exception);
        }
    }


    private void readExerciseHeartRate(
            HealthConnectManager manager,
            Executor executor,
            DataOrigin garminOrigin,
            Instant start,
            Instant end,
            JSObject session,
            Runnable done
    ) {
        AggregateRecordsRequest<Long> request =
                new AggregateRecordsRequest
                        .Builder<Long>(
                                instantFilter(
                                        start,
                                        end
                                )
                        )
                        .addAggregationType(
                                HeartRateRecord.BPM_AVG
                        )
                        .addAggregationType(
                                HeartRateRecord.BPM_MAX
                        )
                        .addAggregationType(
                                HeartRateRecord
                                        .HEART_MEASUREMENTS_COUNT
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
                        Long average =
                                result.get(
                                        HeartRateRecord
                                                .BPM_AVG
                                );

                        Long maximum =
                                result.get(
                                        HeartRateRecord
                                                .BPM_MAX
                                );

                        Long count =
                                result.get(
                                        HeartRateRecord
                                                .HEART_MEASUREMENTS_COUNT
                                );

                        if (average != null) {
                            session.put(
                                    "heartRateAverageBpm",
                                    average
                            );
                        }

                        if (maximum != null) {
                            session.put(
                                    "heartRateMaxBpm",
                                    maximum
                            );
                        }

                        session.put(
                                "heartRateSampleCount",
                                count != null
                                        ? count
                                        : 0
                        );

                        done.run();
                    }

                    @Override
                    public void onError(
                            HealthConnectException error
                    ) {
                        session.put(
                                "heartRateError",
                                error.toString()
                        );

                        done.run();
                    }
                }
        );
    }


    private void readExerciseSpeed(
            HealthConnectManager manager,
            Executor executor,
            DataOrigin garminOrigin,
            Instant start,
            Instant end,
            String paceField,
            double paceDistanceMeters,
            JSObject session,
            Runnable done
    ) {
        readSpeedRecordPages(
                manager,
                executor,
                garminOrigin,
                start,
                end,
                -1,
                new ArrayList<>(),
                speedRecords -> {
                        double speedSum = 0.0;
                        double speedMax = 0.0;
                        int sampleCount = 0;

                        for (
                                SpeedRecord record :
                                speedRecords
                        ) {
                            for (
                                    SpeedRecord
                                            .SpeedRecordSample sample :
                                    record.getSamples()
                            ) {
                                double metersPerSecond =
                                        sample
                                                .getSpeed()
                                                .getInMetersPerSecond();

                                if (
                                        !Double.isFinite(
                                                metersPerSecond
                                        ) ||
                                        metersPerSecond < 0
                                ) {
                                    continue;
                                }

                                speedSum +=
                                        metersPerSecond;

                                speedMax =
                                        Math.max(
                                                speedMax,
                                                metersPerSecond
                                        );

                                sampleCount++;
                            }
                        }

                        session.put(
                                "speedSampleCount",
                                sampleCount
                        );

                        if (sampleCount > 0) {
                            double average =
                                    speedSum /
                                    sampleCount;

                            session.put(
                                    "speedAverageMetersPerSecond",
                                    average
                            );

                            session.put(
                                    "speedMaxMetersPerSecond",
                                    speedMax
                            );

                            Double pace =
                                    paceSecondsForDistance(
                                            average,
                                            paceDistanceMeters
                                    );

                            if (pace != null) {
                                session.put(
                                        paceField,
                                        pace
                                );
                            }
                        }

                        done.run();
                    },
                error -> {
                        session.put(
                                "speedError",
                                error.toString()
                        );

                        done.run();
                }
        );
    }


    private void readSpeedRecordPages(
            HealthConnectManager manager,
            Executor executor,
            DataOrigin origin,
            Instant start,
            Instant end,
            long pageToken,
            ArrayList<SpeedRecord> records,
            Consumer<List<SpeedRecord>> onResult,
            Consumer<Exception> onError
    ) {
        ReadRecordsRequestUsingFilters.Builder<
                SpeedRecord
                > builder =
                new ReadRecordsRequestUsingFilters
                        .Builder<>(SpeedRecord.class)
                        .setTimeRangeFilter(
                                instantFilter(start, end)
                        )
                        .addDataOrigins(origin)
                        .setAscending(true)
                        .setPageSize(100);

        if (pageToken != -1) {
            builder.setPageToken(pageToken);
        }

        try {
            manager.readRecords(
                    builder.build(),
                    executor,
                    new OutcomeReceiver<
                            ReadRecordsResponse<SpeedRecord>,
                            HealthConnectException
                            >() {

                        @Override
                        public void onResult(
                                ReadRecordsResponse<SpeedRecord>
                                        result
                        ) {
                            records.addAll(
                                    result.getRecords()
                            );

                            long nextPageToken =
                                    result.getNextPageToken();

                            if (nextPageToken == -1) {
                                onResult.accept(records);
                                return;
                            }

                            readSpeedRecordPages(
                                    manager,
                                    executor,
                                    origin,
                                    start,
                                    end,
                                    nextPageToken,
                                    records,
                                    onResult,
                                    onError
                            );
                        }

                        @Override
                        public void onError(
                                HealthConnectException error
                        ) {
                            onError.accept(error);
                        }
                    }
            );
        } catch (Exception exception) {
            onError.accept(exception);
        }
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
