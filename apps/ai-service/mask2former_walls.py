"""
Mask2Former wall segmentation (Hugging Face, CubiCasa5K fine-tune).

Model: phungpx/mask2former-swin-base-cubicassa
Free / open weights — lazy-loaded on first use.
"""
from __future__ import annotations

import logging
from typing import Optional

import cv2
import numpy as np
import torch

logger = logging.getLogger(__name__)

MODEL_ID = "phungpx/mask2former-swin-base-cubicassa"


class Mask2FormerWallDetector:
    """Lazy-loaded Mask2Former instance segmenter for walls."""

    def __init__(self, model_id: str = MODEL_ID, device: Optional[str] = None):
        self.model_id = model_id
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.processor = None
        self.model = None
        self._failed = False

    def _ensure_loaded(self) -> bool:
        if self._failed:
            return False
        if self.model is not None:
            return True
        try:
            from transformers import AutoImageProcessor, Mask2FormerForUniversalSegmentation

            logger.info("📦 Loading Mask2Former wall model: %s (%s)", self.model_id, self.device)
            self.processor = AutoImageProcessor.from_pretrained(self.model_id)
            self.model = Mask2FormerForUniversalSegmentation.from_pretrained(self.model_id)
            self.model.to(self.device)
            self.model.eval()
            logger.info("✅ Mask2Former wall model ready")
            return True
        except Exception as e:
            logger.warning("⚠ Mask2Former load failed: %s", e)
            self._failed = True
            return False

    def predict_wall_mask(self, bgr_img: np.ndarray, score_threshold: float = 0.5) -> Optional[np.ndarray]:
        """
        Run Mask2Former and return a binary wall mask (uint8 0/255) at input resolution.
        """
        if bgr_img is None or bgr_img.size == 0:
            return None
        if not self._ensure_loaded():
            return None

        h, w = bgr_img.shape[:2]
        rgb = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)

        try:
            inputs = self.processor(images=rgb, return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self.model(**inputs)

            result = self.processor.post_process_instance_segmentation(
                outputs,
                threshold=score_threshold,
                target_sizes=[(h, w)],
            )[0]

            mask = np.zeros((h, w), dtype=np.uint8)
            seg = result.get("segmentation")
            segments = result.get("segments_info") or []

            if seg is None:
                logger.warning("Mask2Former returned empty segmentation")
                return None

            if isinstance(seg, torch.Tensor):
                seg_np = seg.detach().cpu().numpy()
            else:
                seg_np = np.asarray(seg)

            # Union all predicted wall instances (model is single-class: wall)
            if segments:
                for info in segments:
                    sid = info.get("id")
                    score = float(info.get("score", 1.0))
                    if sid is None or score < score_threshold:
                        continue
                    mask[seg_np == sid] = 255
            else:
                # Fallback: any non-background label
                mask[seg_np > 0] = 255

            coverage = float(np.mean(mask > 0))
            logger.info("✓ Mask2Former wall mask coverage=%.3f (%d instances)", coverage, len(segments))
            if coverage < 0.005:
                logger.warning("Mask2Former mask too sparse — treating as failure")
                return None
            return mask
        except Exception as e:
            logger.warning("⚠ Mask2Former inference failed: %s", e)
            return None


# Module-level singleton for the AI service
_detector: Optional[Mask2FormerWallDetector] = None


def get_mask2former_detector() -> Mask2FormerWallDetector:
    global _detector
    if _detector is None:
        _detector = Mask2FormerWallDetector()
    return _detector


def predict_wall_mask(bgr_img: np.ndarray) -> Optional[np.ndarray]:
    return get_mask2former_detector().predict_wall_mask(bgr_img)
