/**Mocking prisma for unit tests. See https://www.prisma.io/docs/guides/testing/unit-testing */
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

import prisma from './utils/prisma';

jest.mock('./utils/prisma', () => ({
  __esModule: true,
  default: mockDeep<PrismaClient>(),
}));

beforeEach(() => {
  mockReset(prismaMock);
});

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
