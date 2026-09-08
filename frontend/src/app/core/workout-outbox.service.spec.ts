import { TelemetryService } from './telemetry.service';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { AuthService } from './auth.service';
import { WorkoutOutboxService } from './workout-outbox.service';
import { WorkoutInactivityService } from './workout-inactivity.service';
import { environment } from '../../environments/environment';
const user=signal<{id:string}|null>({id:'a'});
const snapshot={workoutId:'same-id',status:'finished',finishedAt:'2026-09-08T10:00:00Z',sets:[{weight:0,reps:null}]};
let outbox:WorkoutOutboxService;let http:HttpTestingController;
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
beforeEach(()=>{localStorage.clear();user.set({id:'a'});TestBed.configureTestingModule({providers:[{provide:TelemetryService,useValue:{track:vi.fn()}},provideHttpClient(),provideHttpClientTesting(),{provide:AuthService,useValue:{user,getAccessToken:async()=>`token-${user()?.id}`}}]});outbox=TestBed.inject(WorkoutOutboxService);http=TestBed.inject(HttpTestingController);});
afterEach(()=>{outbox.stop();http.verify();vi.restoreAllMocks();});
it('survives recreation and removes only a confirmed identical workout',async()=>{
 outbox.enqueue(snapshot);outbox.ngOnDestroy();
 outbox=TestBed.runInInjectionContext(()=>new WorkoutOutboxService());
 const first=outbox.sync();const duplicate=outbox.sync();await tick();
 const req=http.expectOne(`${environment.apiUrl}/workouts/same-id`);
 expect(req.request.body).toEqual(snapshot);expect(outbox.snapshots()).toHaveLength(1);
 req.flush(snapshot);await Promise.all([first,duplicate]);expect(outbox.snapshots()).toEqual([]);
});
it('retains failures and retries on connectivity recovery',async()=>{
 outbox.enqueue(snapshot);outbox.start();await tick();
 http.expectOne(`${environment.apiUrl}/workouts/same-id`).flush({}, {status:502,statusText:'Offline'});await tick();
 expect(outbox.snapshots()).toHaveLength(1);window.dispatchEvent(new Event('online'));await tick();
 const req=http.expectOne(`${environment.apiUrl}/workouts/same-id`);expect(req.request.body).toEqual(snapshot);req.flush(snapshot);await tick();expect(outbox.snapshots()).toEqual([]);
});
it('does not send another users queue after switching accounts',async()=>{
 outbox.enqueue(snapshot);user.set({id:'b'});await outbox.sync();http.expectNone(`${environment.apiUrl}/workouts/same-id`);expect(outbox.snapshots()).toEqual([]);
 user.set({id:'a'});expect(outbox.snapshots()).toHaveLength(1);
});
it('waits for an earlier autosave while already preserving finalization locally',async()=>{
 let release!:()=>void;outbox.enqueue(snapshot,new Promise<void>(r=>release=r));const run=outbox.sync();await tick();
 expect(outbox.snapshots()).toHaveLength(1);http.expectNone(`${environment.apiUrl}/workouts/same-id`);
 release();await tick();http.expectOne(`${environment.apiUrl}/workouts/same-id`).flush(snapshot);await run;
});
it('preserves a snapshot if the response does not confirm finished status',async()=>{
 outbox.enqueue(snapshot);const run=outbox.sync();await tick();http.expectOne(`${environment.apiUrl}/workouts/same-id`).flush({...snapshot,status:'in_progress'});await run;expect(outbox.snapshots()).toHaveLength(1);
});
it('detects old sessions after returning and snoozes without finishing them',()=>{
 const reminder=TestBed.inject(WorkoutInactivityService);const workout={workoutId:'w',startedAt:new Date(Date.now()-31*60000).toISOString(),sets:[]};
 expect(reminder.idle(workout)).toBe(true);reminder.touch('w');expect(reminder.idle(workout)).toBe(false);
 expect(TestBed.runInInjectionContext(()=>new WorkoutInactivityService()).idle(workout)).toBe(false);
 expect(reminder.idle({...workout,workoutId:'fresh',sets:[{completedAt:new Date().toISOString()}]})).toBe(false);
});
