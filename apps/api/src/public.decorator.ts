import { SetMetadata } from '@nestjs/common';

export const publicRouteKey = 'markfix:public-route';
export const Public = () => SetMetadata(publicRouteKey, true);
