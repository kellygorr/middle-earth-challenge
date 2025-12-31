import { PointType } from '../types';

export type UniformMapLayout = {
  uniformScale: number;
  mapWidth: number;
  mapHeight: number;
  mapOffsetX: number;
  mapOffsetY: number;
  firstCheckpointX: number;
  firstCheckpointY: number;
  initialScrollX: number;
  initialScrollY: number;
};

export function useUniformMapLayout(
  width: number,
  height: number,
  svgWidth: number,
  svgHeight: number,
  firstCheckpoint: PointType,
  targetX: number = 50,
  targetY: number = 300,
): UniformMapLayout {
  const minDimension = Math.min(width, height);
  const minWidthScale = (minDimension * 3) / svgWidth;
  const heightScale = height / svgHeight;
  const uniformScale = Math.max(minWidthScale, heightScale);

  const mapWidth = svgWidth * uniformScale;
  const mapHeight = svgHeight * uniformScale;

  const mapOffsetX = (mapWidth - width) / 2;
  const mapOffsetY = (mapHeight - height) / 2;

  const firstCheckpointX = firstCheckpoint.x * uniformScale - mapOffsetX;
  const firstCheckpointY = firstCheckpoint.y * uniformScale - mapOffsetY;

  const initialScrollX = targetX - firstCheckpointX;
  const initialScrollY = targetY - firstCheckpointY;

  return {
    uniformScale,
    mapWidth,
    mapHeight,
    mapOffsetX,
    mapOffsetY,
    firstCheckpointX,
    firstCheckpointY,
    initialScrollX,
    initialScrollY,
  };
}
