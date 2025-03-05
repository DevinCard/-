const API_BASE_URL = 'http://localhost:3001/api';

// Add token management functions
function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
}

// Add this function to handle API responses
async function handleResponse(response) {
    if (response.status === 401) {
        // Clear token from both storage locations on auth failure
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        throw new Error('Authentication required');
    }
    
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'API request failed');
    }
    return data;
}

const api = {
  getHeaders() {
    // Check both storage locations for the token
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  },

  async getBalance() {
    const response = await fetch(`${API_BASE_URL}/balance`, {
      headers: this.getHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch balance');
    return response.json();
  },

  async getTransactions() {
    try {
      const response = await fetch(`${API_BASE_URL}/transactions`, {
        headers: this.getHeaders()
      });
      if (response.status === 401) {
        throw new Error('Authentication required');
      }
      if (!response.ok) throw new Error('Failed to fetch transactions');
      return response.json();
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
  },

  async addTransaction(transaction) {
    try {
      console.log('Sending transaction to server:', transaction);
      const response = await fetch(`${API_BASE_URL}/transactions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(transaction)
      });

      const data = await response.json();
      console.log('Server response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add transaction');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  async getCategories() {
    try {
      const response = await fetch(`${API_BASE_URL}/categories`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      
      return handleResponse(response);
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
  },

  async createTransaction(transactionData) {
    const response = await fetch(`${API_BASE_URL}/transactions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(transactionData)
    });
    if (!response.ok) throw new Error('Failed to create transaction');
    return response.json();
  },

  async saveCategory(name, emoji) {
    try {
      const response = await fetch(`${API_BASE_URL}/categories`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ name, emoji })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save category');
      }
      return response.json();
    } catch (error) {
      console.error('Error saving category:', error);
      throw error;
    }
  },

  async updateTransaction(id, transactionData) {
    try {
      const response = await fetch(`${API_BASE_URL}/transactions/${id}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(transactionData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update transaction');
      }
      
      return response.json();
    } catch (error) {
      console.error('Error updating transaction:', error);
      throw error;
    }
  },

  async getGoals() {
    try {
      const response = await fetch(`${API_BASE_URL}/goals`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      
      return handleResponse(response);
    } catch (error) {
      console.error('Error fetching goals:', error);
      throw error;
    }
  },

  async createGoal(goalData) {
    try {
      const response = await fetch(`${API_BASE_URL}/goals`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(goalData)
      });
      if (!response.ok) {
        throw new Error('Failed to create goal');
      }
      return response.json();
    } catch (error) {
      console.error('Error creating goal:', error);
      throw error;
    }
  },

  async updateGoal(goalId, { amount }) {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_BASE_URL}/goals/${goalId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ amount })
    });

    return handleResponse(response);
  },

  async addCategory(categoryData) {
    try {
      const response = await fetch(`${API_BASE_URL}/categories`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(categoryData)
      });
      if (!response.ok) {
        throw new Error('Failed to add category');
      }
      return response.json();
    } catch (error) {
      console.error('Error adding category:', error);
      throw error;
    }
  },

  async deleteGoal(goalId) {
    try {
      const response = await fetch(`${API_BASE_URL}/goals/${goalId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      
      return handleResponse(response);
    } catch (error) {
      console.error('Error deleting goal:', error);
      throw error;
    }
  },

  async scheduleRecurringPayment(goalId, data) {
    try {
      const response = await fetch(`${API_BASE_URL}/goals/${goalId}/recurring`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to schedule recurring payment');
      }

      return response.json();
    } catch (error) {
      console.error('Error scheduling recurring payment:', error);
      throw error;
    }
  }
};

// Make api globally available
window.api = api; 