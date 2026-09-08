import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { TrainingExportService } from './training-export.service';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
vi.mock('@capacitor/filesystem',()=>({Directory:{Cache:'CACHE'},Encoding:{UTF8:'utf8'},Filesystem:{writeFile:vi.fn(async()=>({uri:'file://export'})),deleteFile:vi.fn()}}));
vi.mock('@capacitor/share',()=>({Share:{share:vi.fn(async()=>({}))}}));
const user=signal<{id:string}|null>({id:'own'});
let service:TrainingExportService;let http:HttpTestingController;
const result={schema_version:1,generated_at:'2026-09-08T07:00:00Z',count:1,sessions:[{discipline:'swimming',data:{laps:[1]}}]};
beforeEach(()=>{
  vi.clearAllMocks();vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);user.set({id:'own'});
  TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),{provide:AuthService,useValue:{user,getAccessToken:async()=> 'own-token'}}]});
  service=TestBed.inject(TrainingExportService);http=TestBed.inject(HttpTestingController);
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:export'),revokeObjectURL:vi.fn()}));
});
afterEach(()=>{http.verify();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function request(){const promise=service.download();await Promise.resolve();return {promise,req:http.expectOne(`${environment.apiUrl}/training/export`)};}
it('downloads one file on web and blocks duplicate requests',async()=>{
 const {promise,req}=await request();await service.download();expect(req.request.headers.get('Authorization')).toBe('Bearer own-token');
 expect(req.request.params.keys()).toEqual([]);req.flush(result);await promise;
 expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);expect(service.busy()).toBe(false);expect(service.message()).toContain('iniciada');
});
it('shares the same export on Android',async()=>{
 vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
 const {promise,req}=await request();req.flush(result);await promise;
 expect(Filesystem.writeFile).toHaveBeenCalledWith(expect.objectContaining({path:'aptus-entrenamientos-2026-09-08.json',data:JSON.stringify(result,null,2)}));expect(Share.share).toHaveBeenCalledTimes(1);
});
it('does not download empty history',async()=>{const {promise,req}=await request();req.flush({...result,count:0,sessions:[]});await promise;expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();expect(service.message()).toContain('No tienes');});
it('reports errors and unlocks retries',async()=>{const {promise,req}=await request();req.flush({}, {status:502,statusText:'Bad gateway'});await promise;expect(service.error()).toContain('No se pudo');expect(service.busy()).toBe(false);});
it('discards a response after switching accounts',async()=>{const {promise,req}=await request();user.set({id:'other'});req.flush(result);await promise;expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();expect(service.error()).toBeTruthy();});
it('requires an authenticated owner',async()=>{user.set(null);await service.download();http.expectNone(`${environment.apiUrl}/training/export`);expect(service.error()).toBeTruthy();});
