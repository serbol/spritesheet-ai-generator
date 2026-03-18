import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Stepper } from '@shared/components/stepper/stepper';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, Stepper],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {}
