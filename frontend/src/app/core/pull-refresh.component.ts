import { Component, ElementRef, Input, OnDestroy, AfterViewInit, inject, signal } from '@angular/core';
import { WorkoutSessionStateService } from './workout-session-state.service';
@Component({selector:'app-pull-refresh',standalone:true,template:`
  @if (pulling() || busy()) { <p role="status">{{ busy() ? 'Actualizando…' : 'Suelta para actualizar' }}</p> }
  @if (failed()) { <p role="alert">No se pudo actualizar. Inténtalo de nuevo.</p> }
  <ng-content />`,styles:[`:host{display:block}p{margin:0;padding:10px;text-align:center;font-size:13px;color:var(--aptus-text-muted)}`]})
export class PullRefresh implements AfterViewInit, OnDestroy {
  @Input({required:true}) refresh!: () => Promise<unknown>;
  @Input() disabled = false;
  readonly busy = signal(false); readonly pulling = signal(false); readonly failed = signal(false);
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly workout = inject(WorkoutSessionStateService);
  private start?: {x:number;y:number};
  private allowed() { return !this.disabled && !this.busy() && this.workout.state() === 'idle'; }
  private top(target: Element | null): boolean {
    if ((document.scrollingElement?.scrollTop ?? window.scrollY) > 0) return false;
    for (let node = target; node; node = node.parentElement) if (node.scrollTop > 0) return false;
    return true;
  }
  private readonly begin = (event: TouchEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    this.start = undefined; this.pulling.set(false);
    if (!this.allowed() || event.touches.length !== 1 || !this.top(target)
      || target?.closest('input,textarea,select,button,a,summary,form,[contenteditable],[role="dialog"]')
      || document.querySelector('[role="dialog"],.aptus-overlay-shell')
      || document.activeElement?.matches('input,textarea,select,[contenteditable]')) return;
    this.start = {x:event.touches[0].clientX,y:event.touches[0].clientY};
  };
  private readonly move = (event: TouchEvent) => {
    if (!this.start) return;
    if (!this.allowed() || event.touches.length !== 1 || !this.top(event.target as Element)) { this.cancel(); return; }
    const dx = Math.abs(event.touches[0].clientX-this.start.x);
    const dy = event.touches[0].clientY-this.start.y;
    if (dy < 0 || dx > 20) { this.cancel(); return; }
    if (dy > 12 && event.cancelable) event.preventDefault();
    this.pulling.set(dy >= 80);
  };
  private readonly end = () => {
    const run = this.pulling() && this.allowed(); this.cancel();
    if (!run) return;
    this.busy.set(true); this.failed.set(false);
    void Promise.resolve().then(() => this.refresh()).catch(() => this.failed.set(true)).finally(() => this.busy.set(false));
  };
  private readonly cancel = () => { this.start = undefined; this.pulling.set(false); };
  ngAfterViewInit() {
    const el=this.element.nativeElement;
    el.addEventListener('touchstart',this.begin,{passive:true});
    el.addEventListener('touchmove',this.move,{passive:false});
    el.addEventListener('touchend',this.end);
    el.addEventListener('touchcancel',this.cancel);
  }
  ngOnDestroy() {
    const el=this.element.nativeElement;
    el.removeEventListener('touchstart',this.begin);el.removeEventListener('touchmove',this.move);
    el.removeEventListener('touchend',this.end);el.removeEventListener('touchcancel',this.cancel);
  }
}
