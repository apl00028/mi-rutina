import {
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';


export type TrainingDiscipline =
  | 'strength'
  | 'swimming'
  | 'cycling'
  | 'running';


export interface TrainingNavigationTab {
  id: string;
  label: string;
}


@Component({
  selector: 'app-training-navigation',
  standalone: true,
  templateUrl: './training-navigation.html',
  styleUrl: './training-navigation.scss'
})
export class TrainingNavigation {

  @Input({ required: true })
  discipline!: TrainingDiscipline;

  @Input()
  tabs: TrainingNavigationTab[] = [];

  @Input()
  activeTab: string | null = null;

  @Output()
  disciplineChange =
    new EventEmitter<TrainingDiscipline>();

  @Output()
  tabChange =
    new EventEmitter<string>();


  changeDiscipline(
    value: string
  ): void {

    if (
      value === 'strength'
      || value === 'swimming'
      || value === 'cycling'
      || value === 'running'
    ) {
      this.disciplineChange.emit(
        value
      );
    }
  }


  selectTab(
    id: string
  ): void {
    this.tabChange.emit(id);
  }
}
