import { Routes } from '@angular/router';
import { PipelineStep } from '@core/models/pipeline.models';
import { stepGuard } from '@core/guards/step.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'prompt',
    pathMatch: 'full',
  },
  {
    path: 'prompt',
    loadComponent: () =>
      import('@features/prompt/prompt').then(m => m.Prompt),
  },
  {
    path: 'editor',
    loadComponent: () =>
      import('@features/editor/editor').then(m => m.Editor),
    canActivate: [stepGuard(PipelineStep.Editor)],
  },
  {
    path: 'capture',
    loadComponent: () =>
      import('@features/capture/capture').then(m => m.Capture),
    canActivate: [stepGuard(PipelineStep.Capture)],
  },
  {
    path: 'stylize',
    loadComponent: () =>
      import('@features/stylize/stylize').then(m => m.Stylize),
    canActivate: [stepGuard(PipelineStep.Stylize)],
  },
  {
    path: 'export',
    loadComponent: () =>
      import('@features/export/export').then(m => m.Export),
    canActivate: [stepGuard(PipelineStep.Export)],
  },
  {
    path: '**',
    redirectTo: 'prompt',
  },
];
