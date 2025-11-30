import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionsApi, usersApi, goalsApi, familyApi, budgetApi } from '../services/api';

// ============ TRANSACTIONS ============
export const useTransactions = () => {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: () => transactionsApi.getAll(),
    staleTime: 30000,
  });
};

export const useCreateTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => transactionsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
};

export const useUpdateTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      transactionsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
};

export const useDeleteTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
};

// ============ USERS ============
export const useUsers = () => {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
    staleTime: 30000,
  });
};

export const useCreateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
};

// ============ GOALS ============
export const useGoals = () => {
  return useQuery({
    queryKey: ['goals'],
    queryFn: () => goalsApi.getAll(),
    staleTime: 30000,
  });
};

export const useCreateGoal = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => goalsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
  });
};

export const useUpdateGoal = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      goalsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
  });
};

export const useDeleteGoal = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => goalsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
  });
};

export const useContributeToGoal = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount: number; note?: string }) =>
      goalsApi.contribute(id, amount, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
  });
};

// ============ BUDGETS ============
export const useBudgets = () => {
  return useQuery({
    queryKey: ['budgets'],
    queryFn: () => budgetApi.getLimits(),
    staleTime: 30000,
  });
};

export const useSetBudgetLimit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ category, limit }: { category: string; limit: number }) =>
      budgetApi.setLimit(category, limit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
};

export const useDeleteBudgetLimit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (category: string) => budgetApi.deleteLimit(category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
};

// ============ FAMILY ============
export const useFamilyTasks = () => {
  return useQuery({
    queryKey: ['familyTasks'],
    queryFn: () => familyApi.getTasks(),
    staleTime: 30000,
  });
};

export const useCreateFamilyTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => familyApi.createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familyTasks'] });
    },
  });
};

export const useUpdateFamilyTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      familyApi.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familyTasks'] });
    },
  });
};

export const useDeleteFamilyTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => familyApi.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familyTasks'] });
    },
  });
};

export const useFamilyEvents = () => {
  return useQuery({
    queryKey: ['familyEvents'],
    queryFn: () => familyApi.getEvents(),
    staleTime: 30000,
  });
};

export const useCreateFamilyEvent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => familyApi.createEvent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familyEvents'] });
    },
  });
};

export const useDeleteFamilyEvent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => familyApi.deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familyEvents'] });
    },
  });
};
