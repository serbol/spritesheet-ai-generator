import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loading',
  templateUrl: './loading.html',
  styleUrl: './loading.scss',
})
export class Loading {
  active = input<boolean>(false);
  message = input<string>('');
  percent = input<number | null>(null);
}
