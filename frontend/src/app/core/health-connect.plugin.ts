import {
  registerPlugin
} from '@capacitor/core';


export interface HealthConnectAvailability {
  supported: boolean;
  sdkInt: number;
  minimumSdkInt: number;
}


export interface HealthConnectPermissionStatus {
  steps: boolean;
  exercise: boolean;
  distance: boolean;
  speed: boolean;
  heartRate: boolean;
  restingHeartRate: boolean;
  sleep: boolean;
  weight: boolean;
  bodyFat: boolean;
  allGranted: boolean;
}


export interface HealthConnectSnapshot {
  stepsToday?: number;
  stepsSources?: string[];

  restingHeartRate?: number;
  restingHeartRateAt?: string;
  restingHeartRateSource?: string;

  sleepMinutes?: number;
  sleepStart?: string;
  sleepEnd?: string;
  sleepSource?: string;

  weightKg?: number;
  weightAt?: string;
  weightSource?: string;

  bodyFatPercentage?: number;
  bodyFatAt?: string;
  bodyFatSource?: string;
}


export interface HealthConnectExerciseLap {
  index: number;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  lengthMeters?: number;
}


export interface HealthConnectExerciseSegment {
  index: number;
  segmentType: number;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  repetitionsCount: number;
}


export interface HealthConnectExerciseSession {
  exerciseType: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  sourcePackage: string;
  title?: string;
  notes?: string;
  lapCount: number;
  segmentCount: number;
  laps: HealthConnectExerciseLap[];
  segments: HealthConnectExerciseSegment[];
  hasRoute: boolean;
}


export interface HealthConnectSwimmingDistanceRecord {
  startTime: string;
  endTime: string;
  durationSeconds: number;
  distanceMeters: number;
}


export interface HealthConnectSwimmingMetricSession {
  startTime: string;
  endTime: string;
  durationSeconds: number;
  segmentCount: number;
  segmentRepetitions: number;

  distanceMeters?: number;
  distanceError?: string;

  distanceRecordCount: number;
  rawDistanceTotalMeters: number;
  distanceRecords: HealthConnectSwimmingDistanceRecord[];
  distanceRecordsError?: string;

  heartRateAverageBpm?: number;
  heartRateMaxBpm?: number;
  heartRateSampleCount: number;

  speedSampleCount: number;
  speedAverageMetersPerSecond?: number;
  speedMaxMetersPerSecond?: number;
  paceSecondsPer100mFromSpeed?: number;
  speedError?: string;
}


export interface HealthConnectSwimmingMetrics {
  sourcePackage: string;
  lookbackDays: number;
  count: number;
  sessions: HealthConnectSwimmingMetricSession[];
}


export interface HealthConnectExerciseSessions {
  sourcePackage: string;
  lookbackDays: number;
  count: number;
  sessions: HealthConnectExerciseSession[];
}



export interface HealthConnectPlugin {
  isAvailable():
    Promise<HealthConnectAvailability>;

  permissionStatus():
    Promise<HealthConnectPermissionStatus>;

  openPermissions():
    Promise<void>;

  readSnapshot():
    Promise<HealthConnectSnapshot>;

  readGarminExerciseSessions():
    Promise<HealthConnectExerciseSessions>;

  readGarminSwimmingMetrics():
    Promise<HealthConnectSwimmingMetrics>;
}


export const HealthConnect =
  registerPlugin<HealthConnectPlugin>(
    'HealthConnect'
  );
