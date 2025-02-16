const API_BASE_URL = 'http://localhost:3001/api';

const api = {
  getHeaders() {
    const token = localStorage.getItem('token');
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
        headers: this.getHeaders()
      });
      if (response.status === 401) {
        throw new Error('Authentication required');
      }
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch categories');
      }
      return response.json();
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
  }
};

// Make api globally available
window.api = api; 