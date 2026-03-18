import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PipelineStateService } from '@core/services/pipeline-state.service';
import { PipelineStep, StepStatus } from '@core/models/pipeline.models';

interface StepDisplay {
  index: number;
  label: string;
  route: string;
  pipelineStep: PipelineStep;
  status: StepStatus;
}

@Component({
  selector: 'app-stepper',
  templateUrl: './stepper.html',
  styleUrl: './stepper.scss',
})
export class Stepper {
  private readonly router = inject(Router);
  private readonly pipelineState = inject(PipelineStateService);

  private readonly stepDefinitions = [
    { label: 'Prompt', route: '/prompt', pipelineStep: PipelineStep.Prompt },
    { label: 'Editor', route: '/editor', pipelineStep: PipelineStep.Editor },
    { label: 'Capture', route: '/capture', pipelineStep: PipelineStep.Capture },
    { label: 'Stylize', route: '/stylize', pipelineStep: PipelineStep.Stylize },
    { label: 'Export', route: '/export', pipelineStep: PipelineStep.Export },
  ];

  readonly steps = computed<StepDisplay[]>(() => {
    const statuses = this.pipelineState.stepStatuses();
    return this.stepDefinitions.map((def, index) => ({
      index,
      ...def,
      status: statuses[def.pipelineStep],
    }));
  });

  navigateTo(step: StepDisplay): void {
    if (step.status !== 'locked') {
      this.pipelineState.goToStep(step.pipelineStep);
      this.router.navigate([step.route]);
    }
  }
}
