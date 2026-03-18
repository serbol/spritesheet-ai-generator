import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PipelineStateService } from '@core/services/pipeline-state.service';
import { PipelineStep } from '@core/models/pipeline.models';

const stepRoutes: Record<PipelineStep, string> = {
  [PipelineStep.Prompt]: '/prompt',
  [PipelineStep.Editor]: '/editor',
  [PipelineStep.Capture]: '/capture',
  [PipelineStep.Stylize]: '/stylize',
  [PipelineStep.Export]: '/export',
};

export function stepGuard(requiredStep: PipelineStep): CanActivateFn {
  return () => {
    const pipelineState = inject(PipelineStateService);
    const router = inject(Router);

    if (pipelineState.canNavigateTo(requiredStep)) {
      return true;
    }

    const currentStep = pipelineState.currentStep();
    return router.createUrlTree([stepRoutes[currentStep]]);
  };
}
