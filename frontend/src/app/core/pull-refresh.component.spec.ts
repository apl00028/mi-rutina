import { TestBed } from '@angular/core/testing';
import { beforeEach, it, expect, vi } from 'vitest';
import { PullRefresh } from './pull-refresh.component';
import { WorkoutSessionStateService } from './workout-session-state.service';
let fixture:ReturnType<typeof TestBed.createComponent<PullRefresh>>;let reload:ReturnType<typeof vi.fn>;
function touch(type:string,x=0,y=0,target:HTMLElement=fixture.nativeElement){const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:[{clientX:x,clientY:y}]});target.dispatchEvent(event);}
beforeEach(()=>{TestBed.configureTestingModule({imports:[PullRefresh]});fixture=TestBed.createComponent(PullRefresh);reload=vi.fn(async()=>{});fixture.componentRef.setInput('refresh',reload);fixture.detectChanges();});
it('refreshes once after a downward gesture and blocks simultaneous refreshes',async()=>{
 let done!:()=>void;reload.mockReturnValue(new Promise<void>(r=>done=r));
 touch('touchstart');touch('touchmove',0,90);touch('touchend');await Promise.resolve();expect(reload).toHaveBeenCalledTimes(1);
 touch('touchstart');touch('touchmove',0,90);touch('touchend');expect(reload).toHaveBeenCalledTimes(1);done();await fixture.whenStable();
});
it('ignores scrolling midway, controls, sideways gestures and active workouts',()=>{
 fixture.nativeElement.scrollTop=20;touch('touchstart');touch('touchmove',0,90);touch('touchend');fixture.nativeElement.scrollTop=0;
 const input=document.createElement('input');fixture.nativeElement.appendChild(input);touch('touchstart',0,0,input);touch('touchmove',0,90,input);touch('touchend',0,90,input);
 touch('touchstart');touch('touchmove',50,90);touch('touchend');
 TestBed.inject(WorkoutSessionStateService).setActive();touch('touchstart');touch('touchmove',0,90);touch('touchend');expect(reload).not.toHaveBeenCalled();
});
