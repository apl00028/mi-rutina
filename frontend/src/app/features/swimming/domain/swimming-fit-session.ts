export interface SwimmingFitImportResponse {
  start_time?: string;

  pool_length_meters?: number;
  distance_meters?: number;

  total_elapsed_time_seconds?: number;
  total_timer_time_seconds?: number;
  total_moving_time_seconds?: number;

  heart_rate_average_bpm?: number;
  heart_rate_max_bpm?: number;

  total_strokes?: number;
  average_stroke_rate_spm?: number;

  average_speed_meters_per_second?: number;
  max_speed_meters_per_second?: number;
  average_pace_seconds_per_100m?: number;

  total_calories?: number;
  aerobic_training_effect?: number;
  anaerobic_training_effect?: number;

  lengths: Array<{
    start_time?: string;
    duration_seconds?: number;
    distance_meters?: number;
    total_strokes?: number;
    average_stroke_rate_spm?: number;
    swim_stroke?: string;
    length_type?: string;
  }>;
}
