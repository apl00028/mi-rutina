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
  hasRoute: boolean;
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
}


export const HealthConnect =
  registerPlugin<HealthConnectPlugin>(
    'HealthConnect'
  );
