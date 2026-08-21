/**
 * @vitest-environment jsdom
 */

import {
  TestBed
} from '@angular/core/testing';
import {
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import {
  SettingsService
} from '../../core/settings.service';
import {
  Home
} from './home';

describe('Home', () => {
  beforeEach(async () => {
    localStorage.removeItem(
      'gymos-settings-v1'
    );
    document.documentElement.className = '';

    await TestBed.configureTestingModule({
      imports: [
        Home
      ]
    }).compileComponents();
  });

  it('renders the home content with the safe default theme', () => {
    TestBed.inject(
      SettingsService
    );

    const fixture =
      TestBed.createComponent(
        Home
      );

    fixture.detectChanges();

    const text =
      (
        fixture.nativeElement
          .textContent ?? ''
      ).replace(/\s+/g, ' ');

    expect(text).toContain(
      'home works!'
    );
    expect(text).toContain('Inicio');
    expect(text).toContain(
      'Resumen de GymOS.'
    );
    expect(
      document.documentElement.classList
        .contains('gymos-theme-system')
    ).toBe(true);
    expect(
      document.documentElement.classList
        .contains('gymos-theme-dark')
    ).toBe(false);
  });
});
